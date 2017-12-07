'use strict';

const assert = require('assert');
const bufio = require('bufio');
const util = require('./utils/util');
const LedgerError = require('./error');

const apdu = exports;

/*
 * Constants
 */

apdu.EMPTY = Buffer.alloc(0);

/**
 * Maximum depth of HD Path
 * @const {Number}
 */
apdu.MAX_DEPTH = 10;

/**
 * Instruction classes
 * @const {Object}
 */
apdu.CLA = {
  GENERAL: 0xe0,
  VENDOR: 0xd0
};

/**
 * Instruction code
 * @const {Object}
 */
apdu.INS = {
  PUBLIC_KEY: 0x40
};

apdu.insByVal = reverse(apdu.INS);

/**
 * Response status codes
 * @const {Object}
 */
apdu.STATUS_WORDS = {
  INCORRECT_LENGTH: 0x6701,
  INVALID_SECURITY_STATUS: 0x6982,
  INVALID_DATA: 0x6a80,
  FILE_NOT_FOUND: 0x6a82,
  INCORRECT_PARAMETERS: 0x6b00,
  INTERNAL_ERROR: 0x6f,
  SUCCESS: 0x9000
};

const errorMessages = {
  INCORRECT_LENGTH: 'Incorrect length',
  INVALID_SECURITY_STATUS: 'Invalid security status',
  INVALID_DATA: 'Invalid data',
  FILE_NOT_FOUND: 'File not found',
  INCORRECT_PARAMETERS: 'Incorrect parameters',
  INTERNAL_ERROR: 'Internal error',
  UNKNOWN_ERROR: 'Unknown status code'
};

apdu.errors = pairObjects(apdu.STATUS_WORDS, errorMessages);
apdu.statusByVal = reverse(apdu.STATUS_WORDS);

/**
 * APDU Error
 * @extends {LedgerError}
 */

class APDUError extends LedgerError {
  /**
   * Create an APDU error.
   * @constructor
   * @param {String} reason
   * @param {Number} code
   * @param {String} hexCode
   */

  constructor(reason, code, hexCode, start) {
    super();

    this.type = 'APDUError';
    this.code = code || -1;
    this.hexCode = hexCode || '';
    this.message = `${reason}. (0x${this.hexCode})`;

    if (Error.captureStackTrace)
      Error.captureStackTrace(this, start || APDUError);
  }
}

/**
 * Ledger APDU command encoder
 */
class APDUCommand {
  /**
   * APDU command
   * @constructor
   * @param {Object} options
   * @param {Number} options.cla - instruction class
   * @param {Number} options.ins - instruction code
   * @param {Number?} options.p1 - parameter 1
   * @param {Number?} options.p2 - parameter 2
   * @param {Buffer?} options.data - APDUData
   * @param {Number?} options.le - Expected reponse length
   */

  constructor (options) {
    // instruction class
    this.cla = 0;

    // instruction code
    this.ins = 0;

    // parameters
    this.p1 = 0;
    this.p2 = 0;

    this.data = apdu.EMPTY;

    this.le = 64;

    if (options)
      this.set(options);
  }

  /**
   * Set APDU options.
   * @param {Object} options
   */

  set(options) {
    assert(options);
    assert(isU8(options.cla));
    assert(isU8(options.ins));

    this.cla = options.cla;
    this.ins = options.ins;

    if (options.p1 != null) {
      assert(isU8(options.p1));
      this.p1 = options.p1;
    }

    if (options.p2 != null) {
      assert(isU8(options.p2));
      this.p2 = options.p2;
    }

    if (options.data != null) {
      assert(Buffer.isBuffer(options.data));
      this.data = options.data;
    }

    if (options.le != null) {
      assert(isU8(options.le));
      this.le = options.le;
    }
  }

  /**
   * Get size of raw APDU command
   * @returns {Number}
   */

  getSize() {
    return 5 + this.data.length;
  }

  /**
   * Get raw APDU command
   * @returns {Buffer}
   */

  toRaw() {
    const size = this.getSize();
    const bw = bufio.static(size);

    bw.writeU8(this.cla);
    bw.writeU8(this.ins);
    bw.writeU8(this.p1);
    bw.writeU8(this.p2);
    bw.writeU8(this.data.length);
    bw.writeBytes(this.data);

    return bw.render();
  }

  /*
   * Encoding helpers for APDU
   */

  /**
   * split path to 32BE ints
   * @param {Number[]} path
   * @returns {Buffer}
   */

  static encodePath(path) {
    if (typeof path === 'string') {
      path = util.parsePath(path, true);
    }

    const parts = path;
    const bw = bufio.static(1 + parts.length * 4);

    bw.writeU8(parts.length);

    for (const index of parts) {
      bw.writeU32BE(index);
    }

    return bw.render();
  }

  /**
   * Get wallet public key
   * @param {Number[]}
   */

  static getPublicKey(path) {
    const data = this.encodePath(path);

    return new APDUCommand({
      cla: apdu.CLA.GENERAL,
      ins: apdu.INS.PUBLIC_KEY,

      data: data
    });
  }
}

/**
 * APDU Response decoded structure
 */
class APDUResponse {
  /**
   * Create decoded structure
   * @param {Object} options
   * @param {Object} options.data - Data object
   * @param {Number} options.status
   * @param {Number} options.type
   */

  constructor(options) {
    this.data = null;
    this.status = 0;
    this.type = 0;

    if (options)
      this.set(options);
  }

  /**
   * Set APDUResponse options
   * @param {Object} options
   */

  set(options) {
    assert(options);
    assert(options.data);
    assert(typeof options.data === 'object');

    assert(isU16(options.status));
    assert(isU8(options.type));

    this.data = options.data;
    this.status = options.status;
    this.type = options.type;
  }

  /**
   * Inspect APDU Response
   * @returns {Object}
   */

  inspect() {
    const status = apdu.statusByVal[this.status];
    const type = apdu.insByVal[this.type];

    return {
      status: status,
      type: type,
      data: this.data
    };
  }

  /**
   * Decode Public Key APDU Response
   * @param {Buffer} data - Raw APDU Packet
   * @returns {APDUResponse}
   */

  static getPublicKey(data) {
    throwError(data);

    const br = bufio.reader(data);

    const pubkeyLength = br.readU8();
    const pubkey = br.readBytes(pubkeyLength);

    const addressLength = br.readU8();
    const address = br.readBytes(addressLength);

    const chainCode = br.readBytes(32);
    const status = br.readU16BE();

    return new APDUResponse({
      data: {
        publicKey: pubkey,
        address: address.toString(),
        chainCode: chainCode
      },
      status: status,
      type: apdu.INS.PUBLIC_KEY
    });
  }
}

/*
 * Helpers
 */

function isU8(value) {
  return (value & 0xff) === value;
};

function isU16(value) {
  return (value & 0xffff) === value;
};

/*
 * Check if buffer is statusCode
 * @param {Buffer} statusCode
 * @throws {APDUError}
 */

function throwError(statusCode) {
  if (!Buffer.isBuffer(statusCode) || statusCode.length !== 2)
    return;

  // read Uint16BE
  const statusNo = statusCode[0] << 8 | statusCode[1];
  const statusHex = statusCode.toString('hex');

  if (statusCode[0] === apdu.STATUS_WORDS.INTERNAL_ERROR)
    throw new APDUError(errorMessages.INTERNAL_ERROR, statusNo, statusHex);

  const message = apdu.errors[statusNo];

  if (message)
    throw new APDUError(message, statusNo, statusHex);

  throw new APDUError(errorMessages.UNKNOWN_ERROR, statusNo, statusHex);
}

/*
 * Pair object values by keys
 * @param {Object}
 * @param {Object}
 * @returns {Object}
 */

function pairObjects(keyObject, valueObject) {
  const object = Object.create(null);

  for (const key of Object.keys(keyObject)) {
    object[key] = valueObject[key];
  }

  return object;
}

/*
 * Reverse object keys to values
 * @param {Object} object
 * @returns {Object} with reverse keys and values
 */

function reverse(object) {
  const reversed = {};

  for (const key of Object.keys(object))
    reversed[object[key]] = key;

  return reversed;
}

/*
 * Expose
 */

exports.APDUCommand = APDUCommand;
exports.APDUResponse = APDUResponse;
exports.APDUError = APDUError;
