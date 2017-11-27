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
      assert(options.timeout > 0);

      this.timeout = options.timeout;
    }

    if (options.scrambleKey != null) {
      assert(typeof options.scrambleKey === 'string');
      this.scrambleKey = options.scrambleKey;
    }
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
