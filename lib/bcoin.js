/*!
 * bcoin.js - Ledger communication with bcoin primitives
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const util = require('./utils/util');

const {Lock} = require('bmutex');

const Network = require('bcoin/lib/protocol/network');
const MTX = require('bcoin/lib/primitives/mtx');
const HDPublicKey = require('bcoin/lib/hd/public');
const secp256k1 = require('bcrypto').secp256k1;

const {Device} = require('./devices/device');
const LedgerBTC = require('./ledger');
const SignatureObject = require('./sigobj');

/**
 * Ledger BTC App with bcoin primitives
 */

class LedgerBcoin {
  /**
   * Create ledger bcoin app
   * @constructor
   * @param {Object} options
   * @param {String} options.path
   * @param {Device} options.device
   */

  constructor(options) {
    this.device = null;
    this.ledger = null;
    this.network = Network.primary;

    this.signingTX = false;
    this.txlock = new Lock(false);

    if (options)
      this.set(options);
  }

  /**
   * Set options
   * @param {Object} options
   */

  set(options) {
    assert(options);

    if (options.network)
      this.network = Network.get(options.network);

    if (options.device != null) {
      assert(options.device instanceof Device);
      this.device = options.device;
      this.device.set({
        scrambleKey: 'BTC'
      });

      this.ledger = new LedgerBTC(options.device);
    }

    return this;
  }

  /**
   * Get public key
   * @async
   * @param {(Number[]|String)} - Full derivation path
   * @param {apdu.addressFlags} [addressFlags=0x00]
   * @returns {bcoin.HDPublicKey}
   * @throws {LedgerError}
   */

  async getPublicKey(path, addressFlags = 0) {
    assert(this.device);
    assert(path);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    assert(Array.isArray(path), 'Path must be string or array');

    const indexes = path;
    const data = await this.ledger.getPublicKey(path, addressFlags);
    const rawPubkey = data.publicKey;
    const compressedPubkey = secp256k1.publicKeyConvert(rawPubkey, true);

    return new HDPublicKey({
      depth: indexes.length,
      childIndex: indexes[indexes.length - 1],
      parentFingerPrint: 0,
      chainCode: data.chainCode,
      publicKey: compressedPubkey,
      network: this.network
    });
  }

  /**
   * Sign transaction
   * Ledger should finish signing one transaction
   * in order to sign another
   * @async
   * @param {bcoin.MTX} tx - mutable transaction
   * @param {LedgerTXInput[]} ledgerInputs
   * @returns {MTX} - signed mutable transaction
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async signTransaction(tx, ledgerInputs) {
    const unlock = await this.txlock.lock();

    try {
      this.signingTX = true;
      return await this._signTransaction(tx, ledgerInputs);
    } finally {
      this.signingTX = false;
      unlock();
    }
  }

  /**
   * Sign transaction
   * @async
   * @param {bcoin.MTX} tx - mutable transaction
   * @param {LedgerTXInput[]} ledgerInputs
   * @returns {MTX} - signed mutable transaction
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async _signTransaction(tx, ledgerInputs) {
    assert(MTX.isMTX(tx), 'Cannot use non-MTX tx for signing');

    const mtx = tx.clone();
    mtx.view = tx.view;

    const sigstate = SignatureObject.fromOptions({
      mtx: mtx,
      ledger: this.ledger,
      inputs: ledgerInputs
    });

    sigstate.init();

    await sigstate.collectPubkeys();
    await sigstate.collectTrustedInputs();
    await sigstate.cacheWitnessInputs();

    for (const li of ledgerInputs) {
      const index = sigstate.getIndex(li);

      assert(index >= 0, 'Could not find ledger input index.');

      const sig = await sigstate.getSignature(li);

      this.applySignature(tx, index, li, sig);
    }

    sigstate.destroy();

    return tx;
  }

  applySignature(tx, index, ledgerInput, sig) {
    const input = tx.inputs[index];
    const prev = ledgerInput.getPrevRedeem();
    const ring = ledgerInput.getRing(this.network);
    const coin = ledgerInput.getCoin();

    const templated = tx.scriptInput(index, coin, ring);

    if (!templated)
      throw new Error('Could not template input.');

    const redeem = ledgerInput.redeem;
    const witness = ledgerInput.witness;
    const vector = witness ? input.witness : input.script;

    if (redeem) {
      const stack = vector.toStack();
      const redeem = stack.pop();

      const result = tx.signVector(prev, stack, sig, ring);

      if (!result)
        return false;

      result.push(redeem);

      vector.fromStack(result);

      return true;
    }

    const stack = vector.toStack();
    const result = tx.signVector(prev, stack, sig, ring);

    if (!result)
      return false;

    vector.fromStack(result);

    return true;
  }
}

LedgerBcoin.addressFlags = LedgerBTC.addressFlags;

module.exports = LedgerBcoin;
