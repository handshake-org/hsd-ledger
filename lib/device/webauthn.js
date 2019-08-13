/*!
 * webauthn.js - Ledger WebAuthn communication
 * Copyright (c) 2018-2019, The Bcoin Developers (MIT License).
 * Copyright (c) 2019, Boyma Fahnbulleh (MIT License).
 * https://github.com/boymanjor/hsd-ledger
 */

/* eslint-env browser */

'use strict';

const assert = require('assert');
const {Device} = require('./device');
const DeviceError = require('./error');
const {Lock} = require('bmutex');

/**
 * @alias module:device.WebAuthnDevice
 * @extends {device.Device}
 */

class WebAuthn extends Device {
  constructor(options) {
    super(options);

    this.lock = new Lock(false);
    this.opened = false;
    this.type = 'webauthn';
  }

  /**
   * Open device.
   * @throws {DeviceError}
   */

  async open() {
    this.enforce(this.opened === false, 'Device is already open.');
    await WebAuthn.ensureSupport();
    this.opened = true;
  }

  /**
   * Close device.
   */

  async close() {
    this.enforce(this.opened === true, 'Device is already closed.');
    this.opened = false;
  }

  /**
   * Exchange APDU commands with device.
   * Lock
   * @param {Buffer} apdu
   * @returns {Promise<Buffer>}
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
   * Exchange APDU commands with device.
   * without lock.
   * @param {Buffer} apdu
   * @returns {Promise<Buffer>}
   * @throws {LedgerError}
   */

  async _exchange(apdu) {
    this.enforce(this.opened === true, 'Device is not open.');
    assert(Buffer.isBuffer(apdu), 'apdu is not a buffer.');

    const requestOptions = {
      publicKey: {
        timeout: this.timeout,
        challenge: Buffer.alloc(32),
        allowCredentials: [{
          type: 'public-key',
          id: wrapAPDU(apdu, this.scrambleKey)
        }]
      }
    };

    const credential = await navigator.credentials.get(requestOptions);

    return Buffer.from(credential.response.signature);
  }

  /**
   * Assert device.
   * @param {Boolean} value
   * @param {String?} reason
   * @throws {DeviceError}
   */

  enforce(value, reason) {
    if (!value)
      throw new DeviceError(reason, WebAuthn);
  }

  /**
   * Check if WebAuthn is supported.
   * @returns {Boolean}
   */

  static async isSupported() {
    return global.navigator && global.navigator.credentials;
  }

  /**
   * Ensure WebAuthn support.
   * @returns {Boolean}
   * @throws {DeviceError}
   */

  static async ensureSupport() {
    if (!this.isSupported())
      throw new DeviceError('WebAuthn is not supported.', WebAuthn);
  }

  /**
   * Get WebAuthn devices.
   */

  static async getDevices() {
    await this.ensureSupport();

    return [new WebAuthn()];
  }

  static async requestDevice() {
    return new WebAuthn();
  }
}

/**
 * Wrap APDU
 * @ignore
 * @param {Buffer} apdu
 * @param {Buffer} key
 * @returns {Buffer}
 */

function wrapAPDU(apdu, key) {
  const result = Buffer.alloc(apdu.length);

  for (let i = 0; i < apdu.length; i++)
    result[i] = apdu[i] ^ key[i % key.length];

  return result;
}

exports.Device = WebAuthn;
