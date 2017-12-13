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
    this.responses = [];
    this.responseCount = 0;

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

  resetResponses() {
    this.responseCount = 0;
  }

  async exchange(APDU) {
    this.commands.push(APDU);

    if (this.responseCount >= this.responses.length)
      return Buffer.alloc(0);

    return this.responses[this.responseCount++];
  }

  getCommands() {
    return this.commands.slice();
  }

  reset() {
    this.commands = [];
  }
}

exports.Device = TestDevice;
