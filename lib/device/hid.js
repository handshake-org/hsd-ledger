/*!
 * hid.js - Ledger HID communication
 * Copyright (c) 2021, Nodari Chkuaselidze (MIT License).
 * https://github.com/handshake-org/hsd-ledger
 */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const {Lock} = require('bmutex');
const NHID = require('node-hid');
const APDU = require('../apdu');
const {APDUWriter, APDUReader} = APDU;
const DeviceError = require('./error');
const {Device} = require('./device');

/**
 * Ledger HID PacketSize
 */

const PACKET_SIZE = 64;

class HID extends Device {
  constructor(options) {
    super();

    this.lock = new Lock(false);
    this.type = 'hid';

    this.device = null;

    if (options)
      this.set(options);
  }

  /**
   * Set device options.
   * @param {Object} options
   */

  set(options) {
    super.set(options);

    if (options.device != null) {
      if (typeof options.device === 'string') {
        const path = options.device;
        this.device = new NHID.HID(path);
      }

      if (typeof options.device === 'object') {
        const path = options.device.path;
        this.device = new NHID.HID(path);
      }

      assert(this.device, 'Could not set device.');
    }

    if (options.path != null) {
      assert(typeof options.path === 'string');
      this.devicePath = options.path;
    }

    if (options.vendorId != null) {
      assert(typeof options.vendorId === 'number');
      this.vendorId = options.vendorId;
    }

    if (options.productId != null) {
      assert(typeof options.productId === 'number');
      this.productId = options.productId;
    }

    if (options.product != null) {
      assert(typeof options.product === 'string');
      this.productName = options.product;
    }

    if (options.manufacturer != null) {
      assert(typeof options.manufacturer === 'string');
      this.manufacturerName = options.manufacturer;
    }

    if (options.serialNumber != null) {
      assert(typeof options.serialNumber === 'string');
      this.serialNumber = options.serialNumber;
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
      throw new DeviceError(reason, HID);
  }

  async open() {
    this.enforce(this.device, 'Device does not exist.');
    this.logger.info('Device is open.');
  }

  async close() {
    this.enforce(this.device !== null, 'Can not find device.');

    this.device.close();
    this.device = null;

    this.logger.info('Device is closed.');
  }

  /**
   * Pads the buffer to PACKET_SIZE
   * @private
   * @param {Buffer} message
   * @returns {Buffer} - padded
   */

  _padMessage(message) {
    const paddedMessage = Buffer.alloc(PACKET_SIZE);

    message.copy(paddedMessage);
    return paddedMessage;
  }

  /**
   * Write device data
   * @private
   * @param {Buffer} data
   * @returns {Promise}
   */

  _write(data) {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        const level = this.logger.logger.level;

        if (level >= Logger.levels.DEBUG)
          this.logger.debug('==>', data.toString('hex'));

        const array = [0x00];

        for (const val of data.values())
          array.push(val);

        // this.device.write - is synchronous.
        resolve(this.device.write(array));
      });
    });
  }

  /**
   * Read device data
   * @private
   * @returns {Promise}
   */

  async _read() {
    return new Promise((resolve, reject) => {
      this.device.read((err, data) => {
        if (err || !data) {
          reject(err);
          return;
        }

        data = Buffer.from(data);

        const level = this.logger.logger.level;
        if (level >= Logger.levels.DEBUG)
          this.logger.spam('<==', data.toString('hex'));

        resolve(data);
      });
    });
  }

  /**
   * Exchange APDU commands with device
   * Lock
   * @param {Buffer} apdu
   * @returns {Promise<Buffer>} - Response data
   * @throws {LedgerError}
   */

  async exchange(apdu) {
    const unlock = await this.lock.lock();

    try {
      return await this._exchange(apdu);
    } finally {
      unlock();
    }
  }

  /**
   * Exchange APDU command with device
   * without lock
   * @param {Buffer} apdu
   * @returns {Promise<Buffer>} - Response data
   * @throws {LedgerError}
   */

  async _exchange(apdu) {
    this.enforce(this.device, 'Device not found.');

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
      await this._write(this._padMessage(message));

    while (!reader.finished) {
      const data = await this._readTimeout();

      reader.pushMessage(data);
    }

    return reader.getData();
  }

  /**
   * Set options from node-hid options.
   * @param {Object} options
   * @returns {HID}
   */

  fromHIDInfo(options) {
    this.set(options);
    return this;
  }

  /**
   * Get HID device from node-hid options.
   * @param {Object} options
   * @returns {HID}
   */

  static fromHIDInfo(options) {
    const hid = new HID();
    return hid.fromHIDInfo(options);
  }

  /**
   * Get Ledger HID devices
   * @returns {Promise<Object[]>}
   */

  static async getDevices() {
    const allDevices = NHID.devices();
    const devices = [];

    for (const device of allDevices) {
      if (this.isLedgerDevice(device))
        devices.push(new this({device}));
    }

    return devices;
  }

  /**
   * Select first device
   * @param {Promise<HID>}
   */

  static async requestDevice() {
    const devices = await this.getDevices();
    assert(devices.length > 0, 'Could not find a device.');

    return devices[0];
  }

  static isLedgerDevice(deviceOptions) {
    if (process.platform === 'win32' || process.platform === 'darwin') {
      if (deviceOptions.usagePage !== 0xffa0)
        return false;
    } else if (deviceOptions.interface !== 0) {
      return false;
    }

    return deviceOptions.vendorId === 0x2c97;
  }
}

exports.Device = HID;
