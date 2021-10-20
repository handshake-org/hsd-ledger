/*!
 * change.js - Ledger output covenants.
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * Copyright (c) 2019, Boyma Fahnbulleh (MIT License).
 * https://github.com/handshake-org/hsd
 */

'use strict';

const assert = require('bsert');
const Rules = require('hsd/lib/covenants/rules')

/**
 * Ledger-aware output covenants used to verify
 * covenant updates on-device.
 */

class LedgerCovenant {
  /**
   * @constructor
   * @param {Object} options
   * @param {Number} options.index
   * @param {Number} options.version
   * @param {(String|Number[])} options.path
   */

  constructor(options) {
    this.index = null;
    this.name = null;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Set options for LedgerCovenant.
   * @param {Object} options
   */

  fromOptions(options) {
    assert(options, 'LedgerCovenant data is required.');
    assert(options.index != null, 'Index is required.');
    assert(options.name != null, 'Name is required.');
    assert((options.index >>> 0) === options.index, 'Index must be a Uint8.');
    assert(options.index >= 0 && options.index < 256, 'Index must be a Uint8.');

    this.index = options.index;

    assert(Rules.verifyString(options.name), 'Invalid name.');

    this.name = options.name;

    return this;
  }

  hasIndex() {
    if (this.index != null)
      return true;

    return false;
  }

  getIndex() {
    return this.index;
  }

  hasName() {
    if (this.name != null)
      return true;

    return false;
  }

  getName() {
    return this.name;
  }

  getSize() {
    return 1 + this.name.length;
  }

  write(bw) {
    bw.writeU8(this.name.length);
    bw.writeBytes(Buffer.from(this.name, 'ascii'));
    return bw;
  }
}

/*
 * Exports
 */

module.exports = LedgerCovenant;
