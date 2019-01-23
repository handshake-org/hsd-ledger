/*!
 * hsd.js - Ledger communication with hsd primitives
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * Copyright (c) 2018, Boyma Fahnbulleh (MIT License).
 * https://github.com/boymanjor/ledger-app-hns
 */

'use strict';

const assert = require('bsert');
const Address = require('hsd/lib/primitives/address');
const HDPublicKey = require('hsd/lib/hd/public');
const MTX = require('hsd/lib/primitives/mtx');
const Network = require('hsd/lib/protocol/network');
const secp256k1 = require('bcrypto').secp256k1;
const TX = require('hsd/lib/primitives/tx');
const Witness = require('hsd/lib/script/witness');
const {Lock} = require('bmutex');
const {read} = require('bufio');

const {Device} = require('./devices/device');
const {Ledger, LedgerSigner} = require('./ledger');
const util = require('./utils/util');

/**
 * ledger-app-hns client with hsd primitives.
 */

class LedgerHSD {
  /**
   * Create Ledger hsd app.
   * @constructor
   * @param {Object} options
   * @param {Device} options.device - Ledger device object
   * @param {String|Network} options.network - Handshake network type
   */

  constructor(options) {
    this.device = null;
    this.ledger = null;
    this.network = Network.primary;
    this.txlock = new Lock(false);

    if (options)
      this.set(options);
  }

  /**
   * Set options.
   * @param {Object} options
   * @param {Device} options.device - Ledger device object
   * @param {String|hsd.Network} options.network - Handshake network type
   */

  set(options) {
    assert(options);

    if (options.network)
      this.network = Network.get(options.network);

    if (options.device != null) {
      assert(options.device instanceof Device);

      this.device = options.device;
      this.device.set({ scrambleKey: 'hns' });
      this.ledger = new Ledger(options.device);
    }

    return this;
  }


  /**
   * Get app version.
   * @async
   * @returns {Object} data
   * @returns {String} data.version
   */

  async getAppVersion() {
    assert(this.device);

    const data = await this.ledger.getAppVersion();

    return data;
  }

  /**
   * Get extended public key and address.
   * @async
   * @param {(Number[]|String)} path - full derivation path
   * @param {Number} confirm - indicates on-device confirmation
   * @returns {Object} data
   * @returns {hsd.HDPublicKey} data.xpub
   * @returns {hsd.Address} data.address
   * @throws {LedgerError}
   */

  async getPublicKey(path, confirm) {
    assert(this.device);
    assert(path);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    assert(Array.isArray(path), 'path must be String or Array');

    const type = this.network.type;
    const data = await this.ledger.getPublicKey(path, confirm, type);
    const address = Address.fromString(data.address, type);
    const xpub = new HDPublicKey({
      depth: path.length,
      childIndex: path[path.length - 1],
      parentFingerPrint: 0,
      chainCode: data.chainCode,
      publicKey: data.publicKey,
      network: this.network
    });

    return { xpub, address };
  }

  /**
   * Sign transaction with lock.
   * @async
   * @param {hsd.MTX|Buffer} mtx - mutable transaction
   * @param {LedgerInput[]} inputs - Ledger aware inputs
   * @returns {MTX}
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async signTransaction(mtx, inputs) {
    const unlock = await this.txlock.lock();
    const signer = LedgerSigner.fromOptions({
      ledger: this.ledger,
      mtx,
      inputs
    });

    try {
      await signer.init();

      const sigs = await this._getSignatures(signer);
      const clone = mtx.clone();
      clone.view = mtx.view;

      for (const input of inputs) {
        const index = signer.getIndex(input);
        const sig = sigs[index];
        const check = this.applySignature(clone, index, input, sig);
        assert(check, 'Could not apply signature.');
      }

      return clone;
    } finally {
      if (signer)
        signer.destroy();

      unlock();
    }
  }

  /**
   * Get signatures for transaction. Signature ordering
   * matches the order of inputs in mtx.inputs array.
   * @param {hsd.MTX|Buffer} mtx - mutable transaction
   * @param {LedgerInput[]} inputs - Ledger aware inputs
   * @returns {Buffer[]}
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async getTransactionSignatures(mtx, inputs) {
    const unlock = await this.txlock.lock();
    const signer = LedgerSigner.fromOptions({
      ledger: this.ledger,
      mtx,
      inputs
    });

    try {
      await signer.init();
      return await this._getSignatures(signer);
    } finally {
      if (signer)
        signer.destroy();

      unlock();
    }
  }

  /**
   * Get signatures from the Ledger device.
   * @private
   * @param {LedgerSigner} signer
   * @returns {Buffer[]}
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async _getSignatures(signer) {
    const inputs = signer.inputs;
    const sigs = new Array(inputs.length);
    let confirm = true;

    for (const input of inputs) {
      const index = signer.getIndex(input);
      const sig = await signer.signInput(input, index, confirm);

      // Even though we can return multiple signatures at once,
      // when signing the same input several times we enforce that
      // this function is called more than once.
      assert(!sigs[index], 'Cannot sign the same input twice.');
      sigs[index] = sig;
    }

    return sigs;
  }

  /**
   * Apply signature to transaction.
   * @param {hsd.MTX} mtx - mutable transaction
   * @param {Number} index - index of the input
   * @param {LedgerInput} ledgerInput
   * @param {Buffer} sig - raw signature
   * @returns {Boolean}
   * @throws {Error}
   */

  applySignature(mtx, index, ledgerInput, sig) {
    const input = mtx.inputs[index];
    const prev = ledgerInput.getPrevRedeem();
    const ring = ledgerInput.getRing(this.network);
    const coin = ledgerInput.getCoin();
    const templated = mtx.scriptInput(index, coin, ring);

    if (!templated)
      throw new Error('Could not template input.');

    const redeem = ledgerInput.redeem;
    const witness = ledgerInput.witness;
    const vector = input.witness;

    if (redeem) {
      const stack = vector.toStack();
      const redeem = stack.pop();
      const result = mtx.signVector(prev, stack, sig, ring);

      if (!result)
        return false;

      result.push(redeem);
      vector.fromStack(result);

      return true;
    }

    const stack = vector.toStack();
    const result = mtx.signVector(prev, stack, sig, ring);

    if (!result)
      return false;

    vector.fromStack(result);

    return true;
  }
}

LedgerHSD.params = Ledger.params;

module.exports = LedgerHSD
