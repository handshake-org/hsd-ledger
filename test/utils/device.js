/*!
 * device.js - Ledger Test Device
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');
const {Device} = require('../../lib/devices/device');

class TestDevice extends Device {
  constructor(options) {
    super(options);

    this.debug = false;
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

    if (options.debug != null)
      this.debug = Boolean(options.debug);
  }

  open() {}

  close() {}

  resetResponses() {
    this.responseCount = 0;
  }

  async exchange(APDU) {
    if (this.debug)
      console.log(`> ${APDU.toString('hex')}`);

    this.commands.push(APDU);

    if (this.responseCount >= this.responses.length)
      return Buffer.alloc(0);

    const response = this.responses[this.responseCount++];

    if (this.debug)
      console.log(`< ${response.toString('hex')}`);

    return response;
  }

  getCommands() {
    return this.commands.slice();
  }

  reset() {
    this.commands = [];
  }
}

exports.Device = TestDevice;
