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
}

/*
 * Expose
 */

exports.Device = Device;
exports.DeviceInfo = DeviceInfo;
