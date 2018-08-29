/*!
 * bcoin.js - Ledger communication with bcoin primitives
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');
const util = require('./utils/util');

const {Lock} = require('bmutex');
const {read} = require('bufio');

const Network = require('bcoin/lib/protocol/network');
const TX = require('bcoin/lib/primitives/tx');
const MTX = require('bcoin/lib/primitives/mtx');
const CoinView = require('bcoin/lib/coins/coinview');
const HDPublicKey = require('bcoin/lib/hd/public');
const secp256k1 = require('bcrypto').secp256k1;

const {Device} = require('./devices/device');
const LedgerBTC = require('./ledger');
const LedgerTXState = require('./txstate');

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
   * Get public key.
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
   * Get signatures for transaction.
   * @param {bcoin.TX|bcoin.MTX|Buffer} tx - transaction
   * @param {bcoin.CoinView|Buffer} view
   * @param {LedgerTXInput[]} ledgerInputs
   * @returns {Buffer[]}
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async getTransactionSignatures(tx, view, ledgerInputs) {
    const unlock = await this.txlock.lock();

    try {
      this.signingTX = true;
      return await this._getTransactionSignatures(tx, view, ledgerInputs);
    } finally {
      this.signingTX = false;
      unlock();
    }
  }

  /**
   * Get signatures for transaction without a lock.
   * @param {bcoin.TX|bcoin.MTX|Buffer} tx
   * @param {bcoin.CoinView|Buffer} view
   * @param {LedgerTXInput[]} ledgerInputs
   * @returns {Buffer[]}
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async _getTransactionSignatures(tx, view, ledgerInputs) {
    if (Buffer.isBuffer(tx))
      tx = MTX.fromRaw(tx);

    if (TX.isTX(tx))
      tx = MTX.fromTX(tx);

    if (Buffer.isBuffer(view))
      view = CoinView.fromReader(read(view), view);

    assert(MTX.isMTX(tx), 'Can not use non-MTX tx for signing');
    assert(view instanceof CoinView,
      'Can not use non-CoinView view for signing');

    const mtx = tx;
    mtx.view = view;

    const sigstate = LedgerTXState.fromOptions({
      mtx: mtx,
      ledger: this.ledger,
      inputs: ledgerInputs
    });

    sigstate.init();

    await sigstate.collectPubkeys();
    await sigstate.collectTrustedInputs();
    await sigstate.cacheWitnessInputs();

    const signatures = new Array(tx.inputs.length);

    for (const li of ledgerInputs) {
      const index = sigstate.getIndex(li);

      assert(index >= 0, 'Could not find ledger input index.');

      const sig = await sigstate.getSignature(li);

      // Even though we can return multiple signatures at once
      // when signing same input several times
      // this won't be common use case, so you can call it twice.
      assert(!signatures[index], 'Can not return same input twice.');
      signatures[index] = sig;
    }

    sigstate.destroy();

    return signatures;
  }

  /**
   * Sign transaction with lock.
   * Ledger should finish signing one transaction
   * in order to sign another.
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
   * Sign transaction without a lock.
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

    const sigstate = LedgerTXState.fromOptions({
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

      assert(this.applySignature(tx, index, li, sig),
        'Adding signature failed.');
    }

    sigstate.destroy();

    return tx;
  }

  /**
   * Apply signature to transaction.
   * @param {bcoin.MTX} tx
   * @param {Number} index - index of the input
   * @param {LedgerTXInput} ledgerInput
   * @param {Buffer} sig - raw signature
   * @returns {Boolean}
   * @throws {Error}
   */

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
