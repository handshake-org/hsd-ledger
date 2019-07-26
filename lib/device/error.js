/*!
 * error.js - Device errors.
 * Copyright (c) 2018-2019, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

/**
 * Device error
 * @alias module:device.DeviceError
 * @extends {Error}
 * @property {String} message - error message.
 */

class DeviceError extends Error {
  /**
   * Create device error.
   * @param {String} reason
   * @param {Function} device
   */

  constructor(reason, device) {
    super();

    this.type = 'DeviceError';
    this.message = reason;

    if (Error.captureStackTrace)
      Error.captureStackTrace(this, device || DeviceError);
  }
}

module.exports = DeviceError;
