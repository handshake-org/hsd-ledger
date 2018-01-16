/*!
 * device.js - Ledger Device
 * Copyright (c) 2017, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const LedgerError = require('./error');

/**
 * Ledger device
 */
class Device {
  /**
   * Create Ledger device
   * @constructor
   * @param {Object} options
   * @param {Number?} [options.timeout=5000]
   * @param {String?} options.scrambleKey
   */

  constructor(options) {
    this.timeout = 5000;
    this.scrambleKey = '';

    if (options)
      this.set(options);
  }

  /**
   * Set device options.
   * @param {Object} options
   */

  set(options) {
    assert(options);

    if (options.timeout != null) {
      assert(typeof options.timeout === 'number');
      assert(options.timeout >= 0);

      this.timeout = options.timeout;
    }

    if (options.scrambleKey != null) {
      assert(typeof options.scrambleKey === 'string');
      this.scrambleKey = options.scrambleKey;
    }
  }

  /**
   * Open connetion with device
   */

  async open () {
    throw new LedgerError('Not implemented');
  }

  /**
   * Close connetion with device
   */

  async close() {
    throw new LedgerError('Not implemented');
  }

  /**
   * Timeout read
   * @private
   * @returns {Promise}
   * @throws {LedgerError}
   */

  async _readTimeout() {
    if (this.timeout === 0)
      return this._read();

    let to;
    const timeout = new Promise((resolve, reject) => {
      to = setTimeout(() => {
        reject(new LedgerError('Read Timeout'));
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
   * @returns {Buffer} - Response data
   */

  async exchange(apdu) {
    throw new LedgerError('Not implemented.');
  }

  /**
   * List ledger devices
   * @returns {DeviceInfo[]}
   */

  static getDevices() {
    throw new LedgerError('Not implemented');
  }
}

/**
 * Device Information
 */

class DeviceInfo {
  /**
   * Common DeviceInfo
   * @constructor
   * @param {Object} options
   * @param {Number} options.vendorId
   * @param {Number} options.productId
   * @param {String} options.manufacturerName
   * @param {String} options.productName
   * @param {String} options.serialNumber
   */

  constructor(options) {
    this.vendorId = 0;
    this.productId = 0;
    this.productName = '';
    this.manufacturerName = '';
    this.serialNumber = '';

    if (options)
      this.set(options);
  }

  /**
   * Set device information
   * @param {Object} options
   */

  set(options) {
    assert(options);

    if (options.vendorId != null) {
      assert(typeof options.vendorId === 'number');
      this.vendorId = options.vendorId;
    }

    if (options.productId != null) {
      assert(typeof options.productId === 'number');
      this.productId = options.productId;
    }

    if (options.manufacturerName != null) {
      assert(typeof options.manufacturerName === 'string');
      this.manufacturerName = options.manufacturerName;
    }

    if (options.productName != null) {
      assert(typeof options.productName === 'string');
      this.productName = options.productName;
    }

    if (options.serialNumber != null) {
      assert(typeof options.serialNumber === 'string');
      this.serialNumber = options.serialNumber;
    }

    return this;
  }

  /**
   * Check device is ledger
   * @param {DeviceInfo} device
   * @returns {Boolean}
   */

  static isLedgerDevice(device) {
    return device.vendorId === 0x2c97;
  }
}

/*
 * Expose
 */

exports.Device = Device;
exports.DeviceInfo = DeviceInfo;
