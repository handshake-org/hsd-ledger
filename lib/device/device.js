/*!
 * device.js - Abstract Ledger Device
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const DeviceError = require('../device/error');

const DEFAULT_SCRAMBLE_KEY = Buffer.from('hns');
const VENDOR_ID = 0x2c97;

/**
 * Ledger device
 * @alias module:device.Device
 * @abstract
 * @property {Number} timeout
 * @property {blgr.Logger?} logger
 * @property {Buffer} scrambleKey
 * @property {String} type - ['usb']
 * @property {Number} productId
 * @property {Number} vendorId
 * @property {String} productName
 * @property {String} manufacturerName
 * @property {String} serialNumber
 */

class Device {
  /**
   * Create Ledger device
   * @constructor
   * @param {Object?} options
   * @param {Number} [options.timeout=1000*60*5]
   * @param {(Buffer|String)} [options.scrambleKey=btc]
   */

  constructor(options) {
    this.logger = null;
    this.timeout = 1000 * 60 * 5;
    this.scrambleKey = DEFAULT_SCRAMBLE_KEY;

    this.type = '';
    this.productId = 0;
    this.vendorId = 0;
    this.productName = '';
    this.manufacturerName = '';
    this.serialNumber = '';

    if (options)
      this.set(options);
  }

  /**
   * Set device options.
   * @param {!Object} options
   * @see {@link Device}
   * @throws {AssertionError}
   */

  set(options) {
    assert(options);

    if (options.logger != null)
      this.logger = options.logger.context('ledger-device');
    else if (this.logger == null) {
      const logger = new Logger();
      this.logger = logger.context('ledger-device');
    }

    if (options.timeout != null) {
      assert(typeof options.timeout === 'number');
      assert(options.timeout >= 0);

      this.timeout = options.timeout;
    }

    if (options.scrambleKey != null) {
      if (typeof options.scrambleKey === 'string')
        options.scrambleKey = Buffer.from(options.scrambleKey, 'ascii');

      assert(Buffer.isBuffer(options.scrambleKey),
        'scramble key must be buffer');

      this.scrambleKey = options.scrambleKey;
    }
  }

  /**
   * Get device with options
   * @returns {Device}
   */

  static fromOptions(options) {
    return new this(options);
  }

  /**
   * Open connetion with device
   * @returns {Promise}
   * @throws {DeviceError}
   */

  async open() {
    ;
  }

  /**
   * Close connetion with device
   * @returns {Promise}
   * @throws {DeviceError}
   */

  async close() {
    ;
  }

  /**
   * Timeout read
   * @private
   * @returns {Promise<Buffer>}
   * @throws {DeviceError}
   */

  async _readTimeout() {
    if (this.timeout === 0)
      return this._read();

    let to;
    const timeout = new Promise((resolve, reject) => {
      to = setTimeout(() => {
        reject(new DeviceError('Read Timeout'));
      }, this.timeout);
    });
    const read = this._read();

    const response = await Promise.race([timeout, read]);
    clearTimeout(to);

    return response;
  }

  /**
   * Exchange APDU command with device
   * @param {Buffer} apdu
   * @returns {Promise<Buffer>} - Response data
   * @throws {DeviceError}
   */

  async exchange(apdu) {
    ;
  }

  /**
   * List ledger devices
   * @returns {Promise<Device[]>}
   */

  static async getDevices() {
    [];
  }

  static async requestDevice() {
    return new Device();
  }

  /**
   * @param {Device} device
   * @returns {Boolean}
   */

  static isLedgerDevice(device) {
    return device.vendorId === VENDOR_ID;
  }
}

/*
 * Expose
 */

exports.Device = Device;
