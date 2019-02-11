/*!
 * apdu.js - Ledger APDU Commands
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * Copyright (c) 2018, Boyma Fahnbulleh (MIT License).
 * https://github.com/boymanjor/hns-ledger
 */
'use strict';

const assert = require('bsert');
const bufio = require('bufio');
const secp256k1 = require('bcrypto/lib/secp256k1');
const {inspect} = require('util');
const LedgerError = require('./error');
const util = require('../utils/util');

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

apdu.cla = {
  GENERAL: 0xe0,
  VENDOR: 0xd0
};

apdu.claByVal = reverse(apdu.cla);

/**
 * Instruction code
 * @const {Object}
 */

apdu.ins = {
  GET_APP_VERSION: 0x40,
  GET_PUBLIC_KEY: 0x42,
  GET_INPUT_SIGNATURE: 0x44,
};

apdu.insByVal = reverse(apdu.ins);

/**
 * Response status codes
 * @const {Object}
 */

apdu.status = {
  CACHE_FLUSH_ERROR: 0x6f27,
  CACHE_WRITE_ERROR: 0x6f26,
  CANNOT_ENCODE_ADDRESS: 0x6f14,
  CANNOT_ENCODE_XPUB: 0x6f23,
  CANNOT_INIT_BLAKE2B_CTX: 0x6f13,
  CANNOT_PEEK_SCRIPT_LEN: 0x6f1e,
  CANNOT_READ_BIP32_PATH: 0x6f15,
  CANNOT_READ_INPUT_INDEX: 0x6f1b,
  CANNOT_READ_INPUTS_LEN: 0x6f18,
  CANNOT_READ_OUTPUTS_LEN: 0x6f19,
  CANNOT_READ_OUTPUTS_SIZE: 0x6f1a,
  CANNOT_READ_TX_VERSION: 0x6f16,
  CANNOT_READ_TX_LOCKTIME: 0x6f17,
  CANNOT_READ_SCRIPT_LEN: 0x6f1d,
  CANNOT_READ_SIGHASH_TYPE: 0x6f1c,
  CANNOT_UPDATE_UI: 0x6f28,
  CLA_NOT_SUPPORTED: 0x6e00,
  CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
  FILE_NOT_FOUND: 0x6a82,
  INCORRECT_ADDR_PATH: 0x6f25,
  INCORRECT_INPUT_INDEX: 0x6f1F,
  INCORRECT_LENGTH: 0x6701,
  INCORRECT_LC: 0x6700,
  INCORRECT_CDATA: 0x6a80,
  INCORRECT_P1: 0x6af1,
  INCORRECT_P2: 0x6af2,
  INCORRECT_PARAMETERS: 0x6b00,
  INCORRECT_PARSER_STATE: 0x6f21,
  INCORRECT_SIGHASH_TYPE: 0x6f20,
  INCORRECT_SIGNATURE_PATH: 0x6f22,
  INCORRECT_INPUTS_LEN: 0x6f24,
  INTERNAL_ERROR: 0x6f,
  INS_NOT_SUPPORTED: 0x6d00,
  SECURITY_CONDITION_NOT_SATISFIED: 0x6982,
  SUCCESS: 0x9000,
};

/**
 * APDU parameter constants
 * @const {Object}
 */

apdu.params = {
  NO_CONFIRM: 0x00,
  CONFIRM_PUBLIC_KEY: 0x01,
  CONFIRM_ADDRESS: 0x03
}

/**
 * Error messages
 * @const {Object}
 */

const errorMessages = {
  CACHE_FLUSH_ERROR: 'Error flushing internal cache',
  CACHE_WRITE_ERROR: 'Error writing to internal cache',
  CANNOT_ENCODE_ADDRESS: 'Cannot bech32 encode address',
  CANNOT_ENCODE_XPUB: 'Cannot base58 encode xpub',
  CANNOT_INIT_BLAKE2B_CTX: 'Cannot initialize blake2b context',
  CANNOT_PEEK_SCRIPT_LEN: 'Cannot peek input script length',
  CANNOT_READ_BIP32_PATH: 'Cannot read BIP32 path',
  CANNOT_READ_INPUT_INDEX: 'Cannot read index of input',
  CANNOT_READ_INPUTS_LEN: 'Cannot read input vector length',
  CANNOT_READ_OUTPUTS_LEN: 'Cannot read output vector length',
  CANNOT_READ_OUTPUTS_SIZE: 'Cannot read size of outputs vector',
  CANNOT_READ_TX_VERSION: 'Cannot read tx version',
  CANNOT_READ_TX_LOCKTIME: 'Cannot read tx locktime',
  CANNOT_READ_SCRIPT_LEN: 'Cannot read input script length',
  CANNOT_READ_SIGHASH_TYPE: 'Cannot read sighash type',
  CANNOT_UPDATE_UI: 'Cannot update Ledger UI',
  CLA_NOT_SUPPORTED: 'Instruction not supported (check app on the device)',
  CONDITIONS_OF_USE_NOT_SATISFIED: 'User rejected on-screen confirmation',
  FILE_NOT_FOUND: 'File not found',
  INCORRECT_ADDR_PATH: 'Incorrect BIP44 address path',
  INCORRECT_CDATA: 'Incorrect CDATA (command data)',
  INCORRECT_INPUT_INDEX: 'Input index larger than inputs vector length',
  INCORRECT_INPUTS_LEN: 'Inputs vector length is larger than device limit',
  INCORRECT_LENGTH: 'Incorrect length',
  INCORRECT_LC: 'Incorrect LC (length of command data)',
  INCORRECT_P1: 'Incorrect P1',
  INCORRECT_P2: 'Incorrect P2',
  INCORRECT_PARAMETERS: 'Incorrect parameters (P1 or P2)',
  INCORRECT_PARSER_STATE: 'Incorrect parser state',
  INCORRECT_SIGHASH_TYPE: 'Incorrect sighash type',
  INCORRECT_SIGNATURE_PATH: 'Incorrect signature path',
  INS_NOT_SUPPORTED: 'Instruction not supported (check app on the device)',
  INTERNAL_ERROR:'Internal error',
  SECURITY_CONDITION_NOT_SATISFIED: 'Invalid security status',
  UNKNOWN_ERROR: 'Unknown status code'
};

/**
 * Error messages by status word
 * @const {Object}
 */

apdu.errorByStatus = pairObjects(apdu.status, errorMessages);

/**
 * Status word messages by value
 * @const {Object}
 */

apdu.statusByVal = reverse(apdu.status);

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
    const cla = apdu.claByVal[this.cla];
    const ins = apdu.insByVal[this.ins];

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
      cla: apdu.cla.GENERAL,
      ins: apdu.ins.GET_APP_VERSION,
      data: apdu.EMPTY
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
    const cla = apdu.cla.GENERAL;
    const ins = apdu.ins.GET_PUBLIC_KEY;
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
      cla: apdu.cla.GENERAL,
      ins: apdu.ins.GET_INPUT_SIGNATURE,
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
   * @param {Boolean} confirm - indicates on-device confirmation
   * @returns {APDUCommand}
   */

  static getInputSignature(input, index, script, confirm) {
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
      cla: apdu.cla.GENERAL,
      ins: apdu.ins.GET_INPUT_SIGNATURE,
      p1: confirm ? 0x01 : 0x00,
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
    const status = apdu.statusByVal[this.status];
    const type = apdu.insByVal[this.type];

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

    const type = apdu.ins.GET_APP_VERSION;
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
    console.log(br.data.toString('hex'));
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
    const type = apdu.ins.GET_PUBLIC_KEY

    return new APDUResponse({ type, data, status });
  }

  /**
   * Decode APDU response.
   * @param {Buffer} data - raw APDU packet
   * @throws {APDUError}
   */

  static parseTX(data) {
    validate(data);

    return emptyResponse(apdu.ins.GET_INPUT_SIGNATURE);
  }

  /**
   * Decode APDU response.
   * @param {Buffer} data
   * @param {boolean} more - specifies if there is more data to receive
   * @returns {APDUResponse}
   * @throws {APDUError}
   */

  static getInputSignature(data, more) {
    validate(data);

    if (more)
      return emptyResponse(apdu.ins.GET_INPUT_SIGNATURE);

    const br = bufio.read(data);
    console.log(br.data.toString('hex'));
    const dersig = br.readBytes(data.length - 2);
    const sig = secp256k1.fromDER(dersig);
    const status = br.readU16BE();

    return new APDUResponse({
      data: sig,
      status: status,
      type: apdu.ins.GET_INPUT_SIGNATURE
    });
  }
}

/*
 * Helpers
 */

function emptyResponse(type) {
  return new APDUResponse({
    data: apdu.EMPTY,
    status: apdu.status.SUCCESS,
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

  if (statusNo === apdu.status.SUCCESS)
    return;

  const message = apdu.errorByStatus[apdu.statusByVal[statusNo]];

  if (message)
    throw new APDUError(message, statusNo, statusHex);

  if (statusCode[0] === apdu.status.INTERNAL_ERROR)
    throw new APDUError(errorMessages.INTERNAL_ERROR, statusNo, statusHex);

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

exports.Command = APDUCommand;
exports.Response = APDUResponse;
exports.Error = APDUError;
