/*!
 * change.js - Ledger change outputs.
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * Copyright (c) 2019, Boyma Fahnbulleh (MIT License).
 * https://github.com/handshake-org/hsd
 */

'use strict';

const assert = require('bsert');
const util = require('../utils/util');

/**
 * Ledger-aware change outputs used to verify
 * p2pkh change addresses on-device.
 */

class LedgerChange {
  /**
   * @constructor
   * @param {Object} options
   * @param {Number} options.index
   * @param {Number} options.version
   * @param {(String|Number[])} options.path
   */

  constructor(options) {
    this.path = [];
    this.index = null;
    this.version = null;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Set options for LedgerChange.
   * @param {Object} options
   */

  fromOptions(options) {
    assert(options, 'LedgerChange data is required.');
    assert(options.index != null, 'Index is required.');
    assert(options.version != null, 'Version is required.');
    assert(options.path != null, 'Path is required.');
    assert((options.index >>> 0) === options.index, 'Index must be an Int.');
    assert(options.index >= 0 && options.index < 256, 'Index must be a Uint8.');

    this.index = options.index;

    assert((options.version >>> 0) === options.version,
      'Version must be an Int.');
    assert(options.version >= 0 && options.version < 256,
      'Version must be a Uint8.');

    this.version = options.version;

    if (typeof options.path === 'string')
      options.path = util.parsePath(options.path, true);

    assert(Array.isArray(options.path), 'Path must be an Array or string.');

    this.path = options.path;

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

  hasVersion() {
    if (this.version != null)
      return true;

    return false;
  }

  getVersion() {
    return this.version;
  }

  hasPath() {
    if (this.path.length !== 0)
      return true;

    return false;
  }

  getPath() {
    return this.path;
  }

  getSize() {
    return 1 + 1 + 1 + this.path.length * 4;
  }

  write(bw) {
    bw.writeU8(this.index);
    bw.writeU8(this.version);
    bw.writeU8(this.path.length);

    for (const index of this.path)
      bw.writeU32BE(index);

    return bw;
  }
}

/*
 * Exports
 */

module.exports = LedgerChange;
