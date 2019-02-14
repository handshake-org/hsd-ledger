/*!
 * ledgerprotocol.js - Ledger Protocol
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const bufio = require('bufio');
const LedgerError = require('../ledger/error');
const util = require('../utils/util');
const protocol = exports;

/**
 * Channel ID
 * @const {Number}
 * @default
 */
protocol.CHANNEL_ID = 0x0101;

/**
 * Command TAG for APDU messages
 * @const {Number}
 * @default
 */
protocol.TAG_APDU = 0x05;

/**
 * Command TAG for Ping
 * @const {Number}
 */
protocol.TAG_PING = 0x02;

/**
 * Maximum packet size
 * @const {Number}
 * @default
 */
protocol.MAX_BYTES = 64;

/**
 * Protocol Error
 * @extends {LedgerError}
 */

class ProtocolError extends LedgerError {
  /**
   * Create an protocol error.
   * @constructor
   * @param {String} reason
   */

  constructor(reason, start) {
    super();

    this.type = 'ProtocolError';
    this.message = `${reason}.`;

    if (Error.captureStackTrace)
      Error.captureStackTrace(this, start || ProtocolError);
  }
}

/**
 * General data structure for ledger protocol
 */
class ProtocolData {
  /**
   * Create general structure for protocol data
   * @param {Object} options
   * @param {Number} options.channelID
   * @param {Number} options.tag - PING or APDU
   * @param {Number} options.packetSize - Size of single packet
   */

  constructor(options) {
    this.channelID = protocol.CHANNEL_ID;
    this.tag = protocol.TAG_APDU;
    this.data = null;
    this.packetSize = protocol.MAX_BYTES;

    if (options)
      this.set(options);
  }

  /**
   * Assertion
   * @param {Boolean} value
   * @param {String} reason
   * @throws {ProtocolError}
   */

  enforce(value, reason) {
    if (!value)
      throw new ProtocolError(reason, this.enforce);
  }

  /**
   * Set ledger protocol options
   * @param {Object} options
   */

  set(options) {
    this.enforce(options, 'Must pass options');

    if (options.channelID != null) {
      this.enforce(isU16(options.channelID), 'ChannelID must be Uint16');
      this.channelID = options.channelID;
    }

    if (options.tag != null) {
      this.enforce(isU8(options.tag), 'Tag must be Uint8');
      this.tag = options.tag;
    }

    if (options.packetSize != null) {
      this.enforce(isU8(options.packetSize), 'Packet size must be Uint8');
      this.packetSize = options.packetSize;
    }
  }

  /**
   * get size of the encoded buffer
   * @param {Number} length - data length
   * @returns {Number}
   */

  getSize(length) {
    const size = length + 7;

    if (size <= this.packetSize)
      return size;

    const dataChunks = this.packetSize - 5;
    const left = size - this.packetSize;
    const parts = this.packetSize * ((left / dataChunks) | 0);

    let last = left % dataChunks;

    if (last !== 0)
      last += 5;

    return this.packetSize + parts + last;
  }

  /**
   * Splits data to protocol messages
   * @param {Buffer} data
   * @returns {Buffer[]}
   */

  splitBuffer(data) {
    return util.splitBuffer(data, this.packetSize);
  }
}

/**
 * Ledger command encoding
 * @extends {ProtocolData}
 */

class ProtocolWriter extends ProtocolData {
  /**
   * Ledger command encoder
   * @constructor
   * @param {Object} options
   * @param {Number?} options.channelID
   * @param {Buffer} options.data
   * @param {Number?} options.tag
   * @param {Number?} options.packetSize
   */

  constructor(options) {
    super(options);

    if (options)
      this.set(options);
  }

  /**
   * Set ledger protocol options
   * @param {Object} options
   */

  set(options) {
    this.enforce(options, 'Must pass options');
    this.enforce(Buffer.isBuffer(options.data), 'Data must be a buffer');

    this.data = options.data;
  }

  /**
   * get size of the encoded buffer
   * @param {Number} length - data length
   * @returns {Number}
   */

  getSize() {
    return super.getSize(this.data.length);
  }

  /**
   * Encode data to bufferwriter
   * @param {BufferWriter} bw
   * @returns {Buffer}
   */

  toWriter(bw) {
    let sequence = 0;
    let offset = 0;
    let left = this.data.length;

    bw.writeU16BE(this.channelID);
    bw.writeU8(this.tag);
    bw.writeU16BE(sequence);
    bw.writeU16BE(this.data.length);

    if (left <= 57) {
      bw.writeBytes(this.data);
      return bw.render();
    }

    bw.copy(this.data, offset, 57);
    offset += 57;
    left -= 57;

    while (left !== 0) {
      sequence++;

      bw.writeU16BE(this.channelID);
      bw.writeU8(this.tag);
      bw.writeU16BE(sequence);

      if (left < 59) {
        bw.copy(this.data, offset, offset + left);
        return bw.render();
      }

      bw.copy(this.data, offset, offset + 59);
      offset += 59;
      left -= 59;
    }

    return bw.render();
  }

  /**
   * Encode data with ledger protocol
   * @returns {Buffer} - Encoded messages
   */

  toRaw() {
    const bw = bufio.write(this.getSize());
    return this.toWriter(bw);
  }

  /**
   * Encode data and split to messages
   * @returns {Buffer[]} - Encoded messages
   */
  toMessages() {
    return this.splitBuffer(this.toRaw());
  }
}

/**
 * Ledger command decoding
 * @extends {ProtocolData}
 */
class ProtocolReader extends ProtocolData {
  constructor(options) {
    super(options);

    this.sequence = 0;
    this.data = null;
    this.size = 0;
    this.finished = false;
  }

  /**
   * Read first message
   * @param {Buffer} message - first message buffer
   */

  readFirstMessage(message) {
    const br = bufio.read(message);

    this.enforce(message.length >= 7 + 5, 'Incorrect message length');
    this.enforce(this.finished !== true, 'Reading from finished reader');

    const channelID = br.readU16BE();
    const tag = br.readU8();
    const sequence = br.readU16BE();
    const length = br.readU16BE();

    this.enforce(this.channelID === channelID, 'Incorrect ChannelID');
    this.enforce(this.tag === tag, 'Incorrect tag');
    this.enforce(this.sequence === sequence, 'Incorrect sequence number');

    this.data = bufio.write(length);
    this.size = length;

    if (length <= this.packetSize - 7) {
      this.data.writeBytes(br.readBytes(length));
      this.finished = true;
      return this.finished;
    }

    this.data.writeBytes(br.readBytes(this.packetSize - 7));
    this.sequence++;

    return this.finished;
  }

  /**
   * Read next message
   * @param {Buffer} message
   * @returns {Boolean} - finished
   */

  readMessage(message) {
    const br  = bufio.read(message);

    this.enforce(this.finished !== true, 'Reading from finished reader');

    const channelID = br.readU16BE();
    const tag = br.readU8();
    const sequence = br.readU16BE();

    this.enforce(this.channelID === channelID, 'Incorrect channelID');
    this.enforce(this.tag === tag, 'Incorrect tag');
    this.enforce(this.sequence === sequence, 'Incorrect sequence number');

    const left = this.size - this.data.getSize();

    if (left <= this.packetSize - 5) {
      this.data.writeBytes(br.readBytes(left));
      this.finished = true;

      return this.finished;
    }

    this.data.writeBytes(br.readBytes(this.packetSize - 5));
    this.sequence++;

    return this.finished;
  }

  /**
   * push ledger protocol message
   * @param {Buffer} message - Single command message
   * @returns {Boolean} - finished
   */
  pushMessage(message) {
    if (this.sequence === 0) {
      return this.readFirstMessage(message);
    }

    return this.readMessage(message);
  }

  /**
   * Get data on finished protocol
   * @returns {Buffer} buffer
   * @throws {ProtocolError}
   */
  getData() {
    if (!this.finished)
      throw new ProtocolError('Reader isn\'t finished');

    return this.data.render();
  }

  /**
   * Assemble data from messages
   * @param {Buffer[]}
   * @returns {Buffer}
   */

  static fromMessages(messages) {
    const reader = new ProtocolReader();

    for (const message of messages) {
      const finished = reader.pushMessage(message);

      if (finished) {
        break;
      }
    }

    return reader.getData();
  }

  /**
   * get data from buffer
   * @param {Buffer} data
   * @param {Number?} packetSize
   * @returns {Buffer}
   */

  static fromBuffer(buffer, packetSize) {
    if (!packetSize)
      packetSize = protocol.MAX_BYTES;

    const messages = util.splitBuffer(buffer, packetSize);

    return this.fromMessages(messages);
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

exports.Writer = ProtocolWriter;
exports.Reader = ProtocolReader;
