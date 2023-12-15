const EventEmitter = require('node:events');
const net = require('node:net');
const assert = require('bsert');
const Logger = require('blgr');
const { Device } = require('./device');
const DeviceError = require('./error');
const { APDU, APDUWriter, APDUReader } = require('../apdu');

const PACKET_SIZE = 64;

class Speculos extends Device {
  constructor(options) {
    super();
    this.type = 'speculos';
    this.vendorId = 0x2c97;

    this.host = '127.0.0.1';
    this.port = 9999;

    /** @type {net.Socket?} */
    this.socket = null;
    this.emitter = new EventEmitter();
    this.buffer = [];

    if (options)
      this.set(options);
  }

  /**
   * Set device options.
   * @param {Object} options
   */

  set(options) {
    // logger, timeout, scrambleKey
    super.set(options);

    if (options.host != null) {
      assert(typeof options.host === 'string');
      this.host = options.host;
    }

    if (options.port != null) {
      assert(typeof options.port === 'number');
      this.port = options.port;
    }
  }

  /**
   * Assertion
   * @param {Boolean} value
   * @param {String?} reason
   * @throws {DeviceError}
   */

  enforce(value, reason) {
    if (!value)
      throw new DeviceError(reason, Speculos);
  }

  /**
   * Open connetion with speculos
   * @returns {Promise<undefined>}
   * @throws {DeviceError}
   */

  async open() {
    this.socket = net.connect(
      this.port,
      this.host
    );

    this.socket.on('data', (data) => {
      this.parseData(data);

      // emit to let any waiting reads know that
      // data has been parsed and is in this.buffer
      this.emitter.emit('parsed-data');
    });
  }

  /**
   * Close connetion with speculos
   * @returns {Promise<undefined>}
   * @throws {DeviceError}
   */

  async close() {
    this.socket.destroy();
  }

  /**
   * Chunk read data and prefix them
   * @private
   * @param {Buffer} data
   */
  parseData(data) {
    const level = this.logger.logger.level;

    if (level >= Logger.levels.DEBUG)
      this.logger.spam('<==', data.toString('hex'));

    // Bump packet size to include status message because
    // Speculos decrements it for some reason:
    // https://github.com/LedgerHQ/speculos/blob/f9dfe878f4934d5dac9fb49a298a136d494c465c/speculos/mcu/apdu.py#L91
    let size = data.readUInt16BE(2);
    size += 2;
    data.writeUInt16BE(size, 2);

    // Client expects chunks of 64 bytes
    let sequence = 0;
    while (data.length > 0) {
      data = prefix(data, sequence++);
      this.buffer.push(data.slice(0, 64));
      data = data.slice(64);
    }
  }

  /**
   * Write APDU data
   * @private
   * @param {Buffer} data
   * @returns {Promise<undefined>}
   */

  async _write(data) {
    this.enforce(this.socket && !this.socket.destroyed, 'Socket not open.');

    // Trim CHANNEL_ID (0x0101) and TAG_APDU (0x05)
    data = data.slice(3);

    // Remove non-zero sequence values after first chunk
    // since Speculos only expects a 4-byte size
    const sequence = data.readUInt16BE(0);
    if (sequence > 0)
      data = data.slice(2);

    await new Promise(resolve => {
      this.socket.write(data, () => resolve());
    })
  }

  /**
   * Read APDU data (one chunk at a time)
   * @private
   * @returns {Promise<Buffer>}
   */

  _read() {
    // Message has already arrived, return it.
    if (this.buffer.length > 0) {
      return this.buffer.shift()
    }

    this.enforce(this.socket && !this.socket.destroyed, 'Socket not open.');

    // Otherwise, wait.
    return new Promise((resolve, reject) => {
      this.emitter.once('parsed-data', () => {
        resolve(this.buffer.shift());
      });
    });
  }

  /**
   * Exchange APDU commands with device
   * @param {Buffer} apdu
   * @returns {Promise<Buffer>} - Response data
   * @throws {LedgerError}
   */

  async exchange(apdu) {
    this.enforce(this.socket && !this.socket.destroyed, 'Socket not open.');

    const writer = new APDUWriter({
      channelID: APDU.CHANNEL_ID,
      tag: APDU.TAG_APDU,
      data: apdu,
      packetSize: PACKET_SIZE
    });

    const reader = new APDUReader({
      channelID: APDU.CHANNEL_ID,
      tag: APDU.TAG_APDU,
      packetSize: PACKET_SIZE
    });

    const messages = writer.toMessages();

    for (const message of messages)
      await this._write(message);

    while (!reader.finished) {
      const data = await this._readTimeout();

      reader.pushMessage(data);
    }

    return reader.getData();
  }

  static async getDevices() {
    return [
      new Speculos(),
    ];
  }

  static async requestDevice() {
    return new Speculos();
  }
}

/**
 * for use in parseData
 * @param {Buffer} data
 * @param {Number} sequence
 * @returns {Buffer} prefixed data
 */
function prefix(data, sequence) {
  let inserted = 3;
  if (sequence > 0)
    inserted += 2;

  const prefixed = Buffer.alloc(inserted + data.length);

  // Prefix the CHANNEL_ID and TAG_APDU
  prefixed[0] = 0x01;
  prefixed[1] = 0x01;
  prefixed[2] = 0x05;
  data.copy(prefixed, inserted);

  if (sequence > 0)
    prefixed.writeUInt16BE(sequence, 3);

  return prefixed;
}

exports.Device = Speculos;
