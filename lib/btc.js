/*!
 * btc.js - Ledger communication
 * Copyright (c) 2017, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const util = require('./utils/util');

const {Device} = require('./device');
const APDU = require('./apdu');
const {APDUCommand, APDUResponse} = APDU;

const DEFAULT_PATH = 'm/0\'/0\'/0\'';
const DEFAULT_PATH_PARSED = util.parsePath(DEFAULT_PATH, true);

class LedgerBTC {
  constructor(options) {
    this.device = null;
    this.path = DEFAULT_PATH;
    this._path = DEFAULT_PATH_PARSED;

    if (options)
      this.set(options);
  }

  set(options) {
    assert(options);

    if (options.device != null) {
      assert(options.device instanceof Device);
      this.device = options.device;
      this.device.set({
        scrambleKey: 'BTC'
      });
    }

    if (options.path != null) {
      assert(typeof options.path === 'string');

      // validate path
      this._path = util.parsePath(options.path, true);

      this.path = options.path;
    }
  }

  async getPublicKey() {
    assert(this.device);

    const command = APDUCommand.getPublicKey(this._path);
    const responseBuffer = await this.device.exchange(command.toRaw());
    const response = APDUResponse.getPublicKey(responseBuffer);

    return response;
  }
}

module.exports = LedgerBTC;
