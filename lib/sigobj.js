/*!
 * sigobj.js - Signature object
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const MTX = require('bcoin/lib/primitives/mtx');
const LedgerBTCApp = require('./ledger');
const secp256k1 = require('bcrypto').secp256k1;

/**
 * Wraps and provides all
 * necessary information for
 * signing.
 */

class SignatureObject {
  /**
   * Create signature object
   * @param {Object} options
   * @param {MTX|JSON} options.mtx
   * @param {LedgerTXInput[]} options.inputs
   */

  constructor(options) {
    this.ledger = null;
    this.mtx = new MTX();
    this.inputs = [];
    this.inputsByKey = new Map();
    this.indexByInput = new Map();
    this.trustedInputs = new Map();
    this.witness = false;
    this.new = true;

    this.signedInputs = 0;

    // process
    this.initialized = false;

    // cache some info
    this._trustedInputs = false;
    this._publicKeys = false;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject properties from options
   * @param {Object} options
   * @returns {SignatureObject}
   */

  fromOptions(options) {
    assert(options, 'SignatureObject options are required.');
    assert(options.mtx, 'MTX is required.');
    assert(options.ledger, 'Ledger app is required.');
    assert(options.ledger instanceof LedgerBTCApp,
      'Ledger is not LedgerBTCApp instance.');

    this.ledger = options.ledger;

    if (!MTX.isMTX(options.mtx) && typeof options.mtx === 'object')
      options.mtx = MTX.fromJSON(options.mtx);

    if (MTX.isMTX(options.mtx))
      this.mtx = options.mtx;

    if (options.inputs) {
      assert(Array.isArray(options.inputs));
      this.inputs = options.inputs;
    }

    return this;
  }

  /**
   * Create sigobject from options
   * @param {Object} options
   * @returns {SignatureObject}
   */

  static fromOptions(options) {
    return new this(options);
  }

  /**
   * Initialize maps with inputs
   */

  init() {
    assert(this.ledger);
    assert(!this.initialized);

    for (const li of this.inputs) {
      this.inputsByKey.set(li.toKey(), li);

      if (li.witness)
        this.witness = true;
    }

    this.mapTXInputs();

    this.initialized = true;

    return this;
  }

  /**
   * Returns signed transaction
   * @returns {MTX}
   */

  getMTX() {
    return this.mtx;
  }

  /**
   * Map transaction inputs to ledger inputs
   * @private
   */

  mapTXInputs() {
    for (const [i, input] of this.mtx.inputs.entries())
      this.indexByInput.set(input.prevout.toKey(), i);
  }

  /**
   * Get ledger input index in tx
   * @param {String|LedgerTXInput} input
   * @returns {Number}
   */

  getIndex(input) {
    if (typeof input === 'string')
      return this.indexByInput.get(input);

    return this.indexByInput.get(input.toKey());
  }

  hasWitness() {
    return this.witness;
  }

  isNew() {
    return this.new;
  }

  // api calls
  async collectPubkeys() {
    assert(this.initialized, 'Can not use uninitialized object.');

    for (const li of this.inputs) {
      if (li.publicKey)
        continue;

      const data = await this.ledger.getPublicKey(li.path);
      const rawpk = data.publicKey;

      // compress public key
      li.publicKey = secp256k1.publicKeyConvert(rawpk, true);
    }

    this._publicKeys = true;
  }

  async collectTrustedInputs() {
    assert(this.initialized, 'Can not use uninitialized object.');

    for (const li of this.inputs) {
      if (li.witness || li.redeem)
        continue;

      if (li.trustedInput)
        continue;

      const trustedInput = await this.ledger.getTrustedInput(li.tx, li.index);
      const key = li.toKey();

      li.trustedInput = trustedInput;
      this.trustedInputs.set(key, trustedInput);
    }

    this._trustedInputs = true;
  }

  async cacheWitnessInputs() {
    assert(this.initialized, 'Can not use uninitialized object.');

    if (!this.witness)
      return;

    await this.ledger.hashTransactionStart(this.mtx, new Map(), true, true);
    await this.ledger.hashOutputFinalize(this.mtx);
    this.new = false;
  }

  async getSignature(li) {
    const inputKey = li.toKey();
    const witness = li.witness;

    const prev = li.getPrevRedeem();

    if (witness) {
      await this.ledger.hashTransactionStartSegwit(this.mtx, inputKey, prev);
    } else {
      await this.ledger.hashTransactionStartNullify(
        this.mtx,
        inputKey,
        prev,
        this.trustedInputs,
        this.isNew(),
        witness
      );

      await this.ledger.hashOutputFinalize(this.mtx);
    }

    const sig = await this.ledger.hashSign(
      this.mtx,
      li.path,
      li.type
    );

    this.new = false;

    return sig;
  }

  /**
   * Destroy signing object
   */

  destroy() {
    this.ledger = null;
    this.mtx = new MTX();
    this.inputs = [];
    this.inputsByKey = new Map();
    this.witness = false;
    this.new = true;
    this.initialized = false;
    this.reset();
  }

  reset() {
    this._publicKeys = false;
    this._trustedInputs = false;
  }
}

module.exports = SignatureObject;
