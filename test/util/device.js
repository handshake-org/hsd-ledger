/*!
 * device.js - Ledger Test Device
 * Copyright (c) 2017, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const {Device} = require('../../lib/device');

class TestDevice extends Device {
  constructor(options) {
    super(options);

    this.commands = [];
    this.responses = {};

    if (options)
      this.set(options);
  }

  set(options) {
    assert(options);

    if (options.responses != null) {
      assert(options.responses instanceof Object);
      this.responses = options.responses;
    }
  }

  open() {}

  close() {}

  async exchange(APDU) {
    this.commands.push(APDU);

    const hexAPDU = APDU.toString('hex');

    if (this.responses[hexAPDU])
      return this.responses[hexAPDU];

    return Buffer.alloc(0);
  }

  getCommands() {
    return this.commands.slice();
  }

  reset() {
    this.commands = [];
  }
}

exports.Device = TestDevice;
