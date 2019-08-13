/*!
 * usb.js - Ledger Web USB/Node USB communication
 * Copyright (c) 2019, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

/* eslint-env browser */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const busb = require('busb');
const {Lock} = require('bmutex');
const DeviceError = require('../device/error');
const APDU = require('../apdu');
const {APDUWriter, APDUReader} = APDU;
const {Device} = require('./device');

/**
 * Ledger USB packet size
 * @const {Number}
 */
const PACKET_SIZE = 64;

/**
 * Configuration to use.
 */

const configurationValue = 1;
const interfaceNumber = 2;
const endpointNumber = 3;

/**
 * Ledger USB device for web and node.
 * @alias module:device.USB
 * @extends {Device}
 * @property {bmutex.Lock} lock
 * @property {busb.USBDevice} device
 */

class USB extends Device {
  /**
   * Create Ledger USB device
   * @constructor
   * @param {Object} options
   * @param {Number?} [options.timeout=5000]
   */

  constructor(options) {
    super();

    this.lock = new Lock(false);
    this.device = null;
    this.type = 'usb';

    if (options)
      this.set(options);
  }

  /**
   * Set device options.
   * @param {Object} options
   * @throws {AssertionError}
   */

  set(options) {
    super.set(options);

    if (options.device != null) {
      const device = options.device;

      assert(device instanceof busb.USBDevice);

      this.device = device;
      this.productId = device.productId;
      this.vendorId = device.vendorId;
      this.productName = device.productName;
      this.manufacturerName = device.manufacturerName;
      this.serialNumber = device.serialNumber;
    }

    return this;
  }

  get opened() {
    this.enforce(this.device, 'Device not found.');
    return this.device.opened;
  }

  /**
   * Assertion
   * @param {Boolean} value
   * @param {String?} reason
   * @throws {DeviceError}
   */

  enforce(value, reason) {
    if (!value)
      throw new DeviceError(reason, USB);
  }

  /**
   * Opens the device
   * @throws {DeviceError}
   */

  async open() {
    await USB.ensureSupport();
    this.enforce(this.device, 'Device not found.');
    this.enforce(this.opened === false, 'Device is already open.');

    const device = this.device;

    await device.open();

    this.enforce(this.device, 'Device not found.');

    if (device.configuration === null
      || device.configuration.configurationValue !== configurationValue)
      await device.selectConfiguration(configurationValue);

    await device.reset();

    try {
      await device.claimInterface(interfaceNumber);
    } catch (e) {
      await device.close();
      throw new DeviceError('USB Interface not available.');
    }

    this.logger.info('Device is open.');
    return this;
  }

  /**
   * Closes the device
   * @throws {DeviceError}
   */

  async close() {
    this.enforce(this.device, 'Device not found.');
    this.enforce(this.opened === true, 'Device is not open.');

    await this.device.releaseInterface(interfaceNumber);
    await this.device.reset();
    await this.device.close();

    this.logger.info('Device is closed.');
    return this;
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
    const level = this.logger.logger.level;

    if (level >= Logger.levels.DEBUG)
      this.logger.debug('==>', data.toString('hex'));

    return this.device.transferOut(endpointNumber, data);
  }

  /**
   * Read device data
   * @private
   * @returns {Promise}
   */

  async _read() {
    const result = await this.device.transferIn(endpointNumber, PACKET_SIZE);
    const level = this.logger.logger.level;

    assert(result.status === 'ok', 'Receiving data failed.');

    const data = Buffer.from(result.data.buffer);

    if (level >= Logger.levels.DEBUG)
      this.logger.debug('<==', data.toString('hex'));

    return data;
  }

  /**
   * Exchange APDU commands with device
   * Lock
   * @param {Buffer} apdu
   * @returns {Promise<Buffer>} - Response data
   * @throws {DeviceError}
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
   * @throws {DeviceError}
   */

  async _exchange(apdu) {
    this.enforce(this.opened === true, 'Device is not open');

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

  /**
   * @param {busb.USBDevice} device
   * @param {Object} options
   * @returns {USB}
   */

  static fromDevice(device, options = {}) {
    assert(device instanceof busb.USBDevice);

    return new this({ device, ...options });
  }

  /**
   * Check if USB transport is available.
   * @returns {Boolean}
   */

  static async isSupported() {
    return !busb.unsupported;
  }

  /**
   * Ensure USB support.
   * @throws {DeviceError}
   */

  static async ensureSupport() {
    if (!this.isSupported())
      throw new DeviceError('USB is not supported.', USB);
  }

  /**
   * List ledger devices
   * @returns {Promise<USB[]>}
   */

  static async getDevices() {
    const allDevices = await busb.usb.getDevices();
    const devices = [];

    for (const device of allDevices) {
      if (USB.isLedgerDevice(device))
        devices.push(USB.fromDevice(device));
    }

    return devices;
  }

  /**
   * Request device
   * @returns {Promise<USB>}
   */

  static async requestDevice() {
    await this.ensureSupport();

    const filters = [USB.getDeviceFilter()];
    let device;

    try {
      device = await busb.usb.requestDevice({ filters });
    } catch (e) {
      throw new DeviceError('Device was not selected.');
    }

    return USB.fromDevice(device);
  }

  static getDeviceFilter() {
    return {
      vendorId: 0x2c97
    };
  }
}
/*
 * Expose
 */

exports.Device = USB;
