/*!
 * signer.js - handles transaction signing state for hns-ledger.
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * Copyright (c) 2018, Boyma Fahnbulleh (MIT License).
 * https://github.com/handshake-org/hsd
 */

'use strict';

const assert = require('bsert');
const MTX = require('hsd/lib/primitives/mtx');
const Script = require('hsd/lib/script').Script;
const LedgerClient = require('../ledger/client');

/**
 * Handles transaction signing using the Ledger device.
 * @private
 * @property {hsd.MTX} mtx
 * @property {LedgerClient} ledger
 * @property {LedgerInput[]} inputs - Ledger aware inputs
 * @property {Map} inputByKey - ledger inputs by outpoint keys
 * @property {Map} indexByKey - input indices by outpoint keys
 */

class LedgerSigner {
  /**
   * Create signer object
   * @constructor
   * @param {Object} options
   * @param {MTX} options.mtx
   * @param {LedgerInput[]} options.inputs
   */

  constructor(options) {
    this.mtx = new MTX();
    this.ledger = null;
    this.inputs = [];
    this.inputByKey = new Map();
    this.indexByKey = new Map();
    this.initialized = false;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject properties from options.
   * @param {Object} options
   * @param {MTX} options.mtx
   * @param {LedgerInput[]} options.inputs
   * @returns {LedgerSigner}
   */

  fromOptions(options) {
    assert(options, 'LedgerSigner options are required.');

    assert(MTX.isMTX(options.mtx),
      'options.mtx must be an instance of MTX.');

    assert(options.ledger instanceof LedgerClient,
      'options.ledger must be an instance of LedgerClient.');

    this.mtx = options.mtx;
    this.ledger = options.ledger;

    if (options.inputs) {
      assert(Array.isArray(options.inputs));
      this.inputs = options.inputs;
    }

    for (const li of this.inputs) {
      const key = li.toKey().toString('hex');
      this.inputByKey.set(key, li);
    }

    for (const [i, input] of this.mtx.inputs.entries()) {
      const key = input.prevout.toKey().toString('hex');
      this.indexByKey.set(key, i);
    }

    return this;
  }

  /**
   * Inject properties from options.
   * @static
   * @param {Object} options
   * @param {MTX} options.mtx
   * @param {LedgerInput[]} options.inputs
   * @returns {LedgerSigner}
   */

  static fromOptions(options) {
    return new this().fromOptions(options);
  }

  /**
   * Get the index of the provided input in the internal
   * transaction's input list. This method can be called
   * before the signer is initialized.
   * @param {String|LedgerInput} input
   * @returns {Number}
   */

  getIndex(input) {
    if (typeof input === 'string')
      return this.indexByKey.get(input);

    const key = input.toKey().toString('hex');
    const index = this.indexByKey.get(key);

    assert(index >= 0, 'Could not find index for LedgerInput.');

    return index;
  }

  /**
   * Initialize the signer by collecting public keys for the inputs
   * that do not contain a redeem script, and sending the transaction
   * details to the Ledger device.
   */

  async init() {
    assert(!this.initialized, 'LedgerSigner already initialized.');

    for(const input of this.inputs) {
      if (!input.publicKey) {
        const { publicKey } = await this.ledger.getPublicKey(input.path);
        input.publicKey = publicKey;
      }
    }

    await this.ledger.parseTX(this.mtx, this.inputByKey);
    this.initialized = true;
  }

  /**
   * Get signature for ledgerInput.
   * @param {LedgerInput} input - Ledger aware input
   * @param {Boolean} confirm - indicates on-device confirmation
   * @returns {Object} data
   * @returns {Buffer} data.signature - the signature on the input
   */

  async signInput(input, index, confirm) {
    assert(this.initialized, 'LedgerSigner not initialized.');

    return await this.ledger.getInputSignature(input, index, confirm);
  }

  /**
   * Destroy signing object.
   */

  destroy() {
    this.mtx = new MTX();
    this.ledger = null;
    this.inputs = [];
    this.inputByKey = new Map();
    this.indexByKey = new Map();
    this.initialized = false;
  }
}

module.exports = LedgerSigner;
