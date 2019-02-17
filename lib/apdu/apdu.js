/*!
 * apdu.js - Ledger APDU Commands
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * Copyright (c) 2018, Boyma Fahnbulleh (MIT License).
 * https://github.com/boymanjor/hns-ledger
 */
'use strict';

const assert = require('bsert');
const bufio = require('bufio');
const {inspect} = require('util');

const common = require('./common');
const util = require('../utils/util');
const LedgerError = require('../ledger/error');

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
   * @param {Number?} options.le - Expected response length
   */

  constructor (options) {
    // instruction class
    this.cla = 0;

    // instruction code
    this.ins = 0;

    // parameters
    this.p1 = 0;
    this.p2 = 0;

    this.data = common.EMPTY;
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
      assert(Buffer.isBuffer(options.data), 'data must be Buffer');
      this.data = options.data;
    }

    if (options.le != null) {
      assert(isU8(options.le));
      this.le = options.le;
    }
  }

  /**
   * Get size of raw APDU command.
   * @returns {Number}
   */

  getSize() {
    return 5 + this.data.length;
  }

  /**
   * Get raw APDU command.
   * @returns {Buffer}
   */

  toRaw() {
    const size = this.getSize();
    const bw = bufio.write(size);

    bw.writeU8(this.cla);
    bw.writeU8(this.ins);
    bw.writeU8(this.p1);
    bw.writeU8(this.p2);
    bw.writeU8(this.data.length);
    bw.writeBytes(this.data);

    return bw.render();
  }

  /**
   * Inspect the APDU Command.
   * @returns {String}
   */

  inspect() {
    const cla = common.claByVal[this.cla];
    const ins = common.insByVal[this.ins];

    return '<APDUCommand:'
      + ` cla=${cla}(${this.cla})`
      + ` ins=${ins}(${this.ins})`
      + ` p1=${this.p1}`
      + ` p2=${this.p2}`
      + ` data=${this.data.toString('hex')}`
      + '>';
  }

  /**
   * Inspect the APDU Command.
   * This is used by node-v10
   * @returns {String}
   */

  [inspect.custom]() {
    return this.inspect();
  }

  /**
   * Encode APDU command.
   * @returns {APDUCommand}
   */

  static getAppVersion() {
    return new APDUCommand({
      cla: common.cla.GENERAL,
      ins: common.ins.GET_APP_VERSION,
      data: common.EMPTY
    });
  }

  /**
   * Encode APDU command.
   * @param {(Number[]|String)} path - full derivation path
   * @param {Number} confirm - indicates on-device confirmation
   * @param {Boolean} xpub - true to return xpub details
   * @param {Boolean} address - true to return address
   * @returns {APDUCommand}
   */

  static getPublicKey(path, confirm, net, xpub, address) {
    const cla = common.cla.GENERAL;
    const ins = common.ins.GET_PUBLIC_KEY;
    const p2 = xpub ? (address ? 0x03 : 0x01) : (address ? 0x02 : 0x00);
    const data = encodePath(path);
    let p1 = confirm ? 0x01 : 0x00;

    switch (net) {
      case 'testnet':
        p1 |= 0x02;
        break;

      case 'regtest':
        p1 |= 0x04;
        break;

      case 'simnet':
        p1 |= 0x06;
        break;

      default:
        p1 |= 0x00;
        break;
    }

    return new APDUCommand({ cla, ins, data, p1, p2 });
  }

  /**
   * Encode APDU command.
   * @param {Buffer} data - raw data
   * @param {Boolean} first - indicates if this is the first msg
   * @returns {APDUCommand}
   */

  static parseTX(data, first) {
    return new APDUCommand({
      cla: common.cla.GENERAL,
      ins: common.ins.GET_INPUT_SIGNATURE,
      p1: first ? 0x01 : 0x00,
      p2: 0x00,
      data: data
    });
  }

  /**
   * Encode APDU command.
   * @param {LedgerInput[]} input
   * @param {Number} index
   * @param {Buffer} script
   * @param {Boolean} initial - indicates whether this is the initial message
   * @returns {APDUCommand}
   */

  static getInputSignature(input, index, script, initial) {
    let data;
    const sendInput = (input && index !== null);

    if (sendInput) {
      const path = encodePath(input.path);
      data = bufio.write(path.length + 5 + script.length);

      data.writeBytes(path);
      data.writeU8(index);
      data.writeU32(input.type);
      data.writeBytes(script);
    }

    return new APDUCommand({
      cla: common.cla.GENERAL,
      ins: common.ins.GET_INPUT_SIGNATURE,
      p1: initial ? 0x01 : 0x00,
      p2: 0x01,
      data: sendInput ? data.render() : script
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
   * Inspect APDU Response.
   * @returns {String}
   */

  inspect() {
    const status = common.statusByVal[this.status];
    const type = common.insByVal[this.type];

    return '<APDUResponse:'
      + ` status=${status}`
      + ` type=${type}`
      + ` data=${inspect(this.data)}`
      + '>';
  }

  /**
   * Inspect APDU Response.
   * @returns String
   */

  [inspect.custom]() {
    return this.inspect();
  }

  /**
   * Decode APDU response.
   * @param {Buffer} res - raw APDU response
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static getAppVersion(res) {
    validate(res);

    const type = common.ins.GET_APP_VERSION;
    const br = bufio.read(res);
    const major = br.readU8();
    const minor = br.readU8();
    const patch = br.readU8();
    const status = br.readU16BE();
    const version = `${major}.${minor}.${patch}`;
    const data = { version };

    return new APDUResponse({ type, data, status });
  }

  /**
   * Decode APDU response.
   * @param {Buffer} res - raw APDU response
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static getPublicKey(res) {
    validate(res);

    const br = bufio.read(res);
    const data = {};

    data.publicKey = br.readBytes(33);

    let len = br.readU8();

    if (len)
      data.chainCode = br.readBytes(len);

    len = br.readU8();

    if (len)
      data.parentFingerPrint = br.readU32BE();

    len = br.readU8();

    if (len)
      data.address = br.readBytes(len).toString();

    const status = br.readU16BE();
    const type = common.ins.GET_PUBLIC_KEY

    return new APDUResponse({ type, data, status });
  }

  /**
   * Decode APDU response.
   * @param {Buffer} data - raw APDU packet
   * @throws {APDUError}
   */

  static parseTX(data) {
    validate(data);

    return emptyResponse(common.ins.GET_INPUT_SIGNATURE);
  }

  /**
   * Decode APDU response.
   * @param {Buffer} data
   * @param {boolean} more - specifies if there is more data to receive
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static getInputSignature(res, more) {
    validate(res);

    if (more)
      return emptyResponse(common.ins.GET_INPUT_SIGNATURE);

    const br = bufio.read(res);
    const signature = br.readBytes(65);
    const data = { signature };
    const status = br.readU16BE();
    const type = common.ins.GET_INPUT_SIGNATURE

    return new APDUResponse({ type, data, status });
  }
}

/*
 * Helpers
 */

function emptyResponse(type) {
  return new APDUResponse({
    data: common.EMPTY,
    status: common.status.SUCCESS,
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
  const bw = bufio.write(1 + parts.length * 4);

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

function validate(statusCode) {
  if (!Buffer.isBuffer(statusCode) || statusCode.length !== 2)
    return;

  // read Uint16BE
  const statusNo = statusCode[0] << 8 | statusCode[1];
  const statusHex = statusCode.toString('hex');

  if (statusNo === common.status.SUCCESS)
    return;

  const message = common.errorByStatus[common.statusByVal[statusNo]];

  if (message)
    throw new APDUError(message, statusNo, statusHex);

  if (statusCode[0] === common.status.INTERNAL_ERROR)
    throw new APDUError(errorMessages.INTERNAL_ERROR, statusNo, statusHex);

  throw new APDUError(errorMessages.UNKNOWN_ERROR, statusNo, statusHex);
}

/*
 * Expose
 */

exports.Command = APDUCommand;
exports.Response = APDUResponse;
exports.Error = APDUError;
