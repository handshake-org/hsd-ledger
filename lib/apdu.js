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
  PUBLIC_KEY: 0x40,
  GET_TRUSTED_INPUT: 0x42,
  UNTRUSTED_HASH_TX_INPUT_START: 0x44,
  UNTRUSTED_HASH_TX_INPUT_FINALIZE: 0x46,
  UNTRUSTED_HASH_SIGN: 0x48,
  UNTRUSTED_HASH_TX_INPUT_FINALIZE_FULL: 0x4a
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
  INS_NOT_SUPPORTED: 0x6d00,
  INTERNAL_ERROR: 0x6f,
  SUCCESS: 0x9000
};

const errorMessages = {
  INCORRECT_LENGTH: 'Incorrect length',
  INVALID_SECURITY_STATUS: 'Invalid security status',
  INVALID_DATA: 'Invalid data',
  FILE_NOT_FOUND: 'File not found',
  INCORRECT_PARAMETERS: 'Incorrect parameters',
  INS_NOT_SUPPORTED: 'Instruction not supported (check app on the device)',
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
      assert(Buffer.isBuffer(options.data), 'Data must be buffer');
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

  /**
   * Get wallet public key
   * @param {Number[]}
   * @returns {APDUCommand}
   */

  static getPublicKey(path) {
    const data = encodePath(path);

    return new APDUCommand({
      cla: apdu.CLA.GENERAL,
      ins: apdu.INS.PUBLIC_KEY,

      data: data
    });
  }

  /**
   * Get trusted input
   * @param {Buffer} data - Raw data
   * @param {Boolean} [first=false] - First part
   * @returns {APDUCommand}
   */

  static getTrustedInput(data, first = false) {
    return new APDUCommand({
      cla: apdu.CLA.GENERAL,
      ins: apdu.INS.GET_TRUSTED_INPUT,

      p1: first ? 0x00 : 0x80,
      data: data
    });
  }

  /**
   * Get trusted input
   * @param {Buffer} data - Raw data
   * @param {Boolean} [first=false] - First part
   * @param {Boolean} [newTransaction=false]
   * @returns {APDUCommand}
   */

  static hashTransactionStart(data, first = false, newTransaction = false) {
    return new APDUCommand({
      cla: apdu.CLA.GENERAL,
      ins: apdu.INS.UNTRUSTED_HASH_TX_INPUT_START,

      p1: first ? 0x00 : 0x80,
      p2: newTransaction ? 0x00 : 0x80,

      data: data
    });
  }

  /**
   * Untrusted hash transaction input finalize
   * @param {Buffer} data
   * @param {Boolean} [more=false]
   * @returns {APDUCommand}
   */

  static hashOutputFinalize(data, more = true) {
    return new APDUCommand({
      cla: apdu.CLA.GENERAL,
      ins: apdu.INS.UNTRUSTED_HASH_TX_INPUT_FINALIZE_FULL,

      p1: more ? 0x00 : 0x80,

      data: data
    });
  }

  /**
   * Untrusted hash sign
   * @param {Number[]} path
   * @param {Number} lockTime
   * @param {bcoin.SighashType} sighashType
   * @returns {APDUCommand}
   */

  static hashSign(path, lockTime, sighashType) {
    // TODO(node): user validation codes

    const encodedPath = encodePath(path);
    const data = bufio.static(encodedPath.length + 6);

    data.writeBytes(encodedPath);
    data.writeU8(0x00); // user validation codes
    data.writeU32BE(lockTime);
    data.writeU8(sighashType);

    return new APDUCommand({
      cla: apdu.CLA.GENERAL,
      ins: apdu.INS.UNTRUSTED_HASH_SIGN,

      data: data.render()
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
   * @param {Buffer} data - Raw APDU packet
   * @returns {APDUResponse}
   * @throws {APDUError}
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

  /**
   * Decode get trusted input response
   * @param {Buffer} data - Raw APDU packet
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static getTrustedInput(data) {
    throwError(data);

    if (data.length === 2)
      return emptyResponse(apdu.INS.GET_TRUSTED_INPUT);

    const br = bufio.reader(data);
    const trustedInput = br.readBytes(56);
    const status = br.readU16BE();

    return new APDUResponse({
      data: trustedInput,
      status: status,
      type: apdu.INS.GET_TRUSTED_INPUT
    });
  }

  /**
   * Decode untrusted hash transaction input start
   * @param {Buffer} data - Raw APDU packet
   * @throws {APDUError}
   */

  static hashTransactionStart(data) {
    throwError(data);

    return emptyResponse(apdu.INS.UNTRUSTED_HASH_TX_INPUT_START);
  }

  /**
   * Decode untrusted hash tx input finalize
   * @param {Buffer} data
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static hashOutputFinalize(data) {
    throwError(data);

    if (data.length === 2)
      return emptyResponse(apdu.INS.UNTRUSTED_HASH_TX_INPUT_FINALIZE);

    const br = bufio.reader(data);
    const userValidations = [];

    for (let i = 0; i < data.length - 2; i++)
      userValidations.push(Boolean(br.readU8()));

    const status = br.readU16BE();

    return new APDUResponse({
      data: userValidations,
      status: status,
      type: apdu.INS.UNTRUSTED_HASH_TX_INPUT_FINALIZE
    });
  }

  /**
   * Decide hash sign
   * @param {Buffer} data
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static hashSign(data) {
    throwError(data);

    const br = bufio.reader(data);
    const signature = br.readBytes(data.length - 2);
    const status = br.readU16BE();

    signature[0] &= 0xFE;

    return new APDUResponse({
      data: signature,
      status: status,
      type: apdu.INS.UNTRUSTED_HASH_SIGN
    });
  }
}

/*
 * Helpers
 */

function emptyResponse(type) {
  return new APDUResponse({
    data: apdu.EMPTY,
    status: apdu.STATUS_WORDS.SUCCESS,
    type: type
  });
}

function isU8(value) {
  return (value & 0xff) === value;
};

function isU16(value) {
  return (value & 0xffff) === value;
};

/**
 * split path to 32BE ints
 * @param {Number[]} path
 * @returns {Buffer}
 */

function encodePath(path) {
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
};

/**
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

  if (statusNo === apdu.STATUS_WORDS.SUCCESS)
    return;

  if (statusCode[0] === apdu.STATUS_WORDS.INTERNAL_ERROR)
    throw new APDUError(errorMessages.INTERNAL_ERROR, statusNo, statusHex);

  const message = apdu.errors[apdu.statusByVal[statusNo]];

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
