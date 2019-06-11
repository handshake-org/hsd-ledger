/*!
 * hsd.js - client for ledger-app-hns with hsd primitives
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * Copyright (c) 2018, Boyma Fahnbulleh (MIT License).
 * https://github.com/boymanjor/ledger-app-hns
 */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const {Lock} = require('bmutex');
const {HDPublicKey, Network} = require('hsd');

const util = require('../utils/util');
const { Device } = require('../device/device');
const { LedgerClient, LedgerInput, LedgerSigner } = require('./');

/**
 * ledger-app-hns client with hsd primitives.
 */

class LedgerHSD {
  /**
   * Create Ledger hsd app.
   * @constructor
   * @param {Object} options
   * @param {Device} options.device - USB device object
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
   * @param {Device} options.device - USB device object
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
      this.ledger = new LedgerClient({
        device: options.device,
        network: this.network
      });
    }

    if (options.logger != null)
      this.logger = options.logger.context('ledger-hsd');
    else if (this.logger == null) {
      const logger = new Logger();
      this.logger = logger.context('ledger-hsd');
    }

    return this;
  }

  /**
   * Get app version.
   * @async
   * @returns {String} version
   */

  async getAppVersion() {
    this.logger.debug('Invoked getAppVersion');

    assert(this.device, 'Device must be initialized.');
    assert(this.ledger, 'LedgerClient must be initialized.');

    const data = await this.ledger.getAppVersion();

    return data.version;
  }

  /**
   * Get a BIP44 account extended public key using hardened derivation.
   * The coin type is inferred from the network flag passed to LedgerHSD.
   * @async
   * @param {Number} account - account index (assumes hardened derviation)
   * @param {Object} options
   * @param {Number} options.confirm - true for on-device confirmation
   * @returns {hsd.HDPublicKey} xpub
   * @throws {LedgerError}
   */

  async getAccountXPUB(account, options) {
    this.logger.debug('Invoked getAccountXPUB');

    assert(this.device, 'Device must be initialized.');
    assert(this.ledger, 'LedgerClient must be initialized.');
    assert((account >>> 0) === account, 'Index out of range.');

    if (!options) {
      options = Object.create(null);
      options.confirm = false;
    }

    assert(typeof options.confirm === 'boolean',
      'options.confirm must be a Boolean');

    options.xpub = true;
    options.address = false;

    const path = [
      util.BIP44_PURPOSE,
      util.BIP44_COIN_TYPE[this.network.type],
      util.harden(account)
    ];

    const data = await this.ledger.getPublicKey(path, options);

    return new HDPublicKey({
      depth: path.length,
      childIndex: path[path.length - 1],
      parentFingerPrint: data.parentFingerPrint,
      chainCode: data.chainCode,
      publicKey: data.publicKey,
      network: this.network
    });
  }

  /**
   * Get an extended public key.
   *
   * This call does not assume any path prefixes. Caller must indicate
   * whether hardened derivation is necessary. This method expects
   * the path to start from the root node, e.g. "m/44'/5353'/0'/0/0" or
   * [0x8000002c, 0x800014e9, 0x80000000, 0, 0]. Paths longer than the
   * BIP44 address level or paths using unhardened derivation at or
   * above the BIP44 account level will trigger an on-device warning.
   * @async
   * @param {(String|Number[])} path - full derivation path
   * @param {Object} options
   * @param {Number} options.confirm - true for on-device confirmation
   * @returns {hsd.HDPublicKey} xpub
   * @throws {LedgerError}
   */

  async getXPUB(path, options) {
    this.logger.debug('Invoked getXPUB');

    assert(this.device, 'Device must be initialized.');
    assert(this.ledger, 'LedgerClient must be initialized.');
    assert(path);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    assert(Array.isArray(path), 'path must be String or Array');

    if (!options) {
      options = Object.create(null);
      options.confirm = false;
    }

    assert(typeof options.confirm === 'boolean',
      'options.confirm must be a Boolean');

    options.xpub = true;
    options.address = false;

    const data = await this.ledger.getPublicKey(path, options);

    return new HDPublicKey({
      depth: path.length,
      childIndex: path[path.length - 1],
      parentFingerPrint: data.parentFingerPrint,
      chainCode: data.chainCode,
      publicKey: data.publicKey,
      network: this.network
    });
  }

  /**
   * Get a BIP44 compliant address using hardened derivation.
   * The coin type is inferred from the network flag passed to LedgerHSD.
   * @async
   * @param {Number} account - account index (assumes hardened derviation)
   * @param {Number} change - 0 for receive address, 1 for change address
   * @param {Number} index - address index
   * @param {Object} options
   * @param {Number} options.confirm - true for on-device confirmation
   * @returns {String} address
   * @throws {LedgerError}
   */

  async getAddress(account, change, index, options) {
    this.logger.debug('Invoked getAddress');

    assert(this.device, 'Device must be initialized.');
    assert(this.ledger, 'LedgerClient must be initialized.');
    assert((account >>> 0) === account, 'Index out of range.');
    assert(change === 0 || change === 1, 'Change must be 0 or 1.');
    assert((index >>> 0) === index, 'Index out of range.');

    if (!options) {
      options = Object.create(null);
      options.confirm = false;
    }

    assert(typeof options.confirm === 'boolean',
      'options.confirm must be a Boolean');

    options.xpub = false;
    options.address = true;

    const path = [
      util.BIP44_PURPOSE,
      util.BIP44_COIN_TYPE[this.network.type],
      util.harden(account),
      change,
      index
    ];

    const data = await this.ledger.getPublicKey(path, options);

    return data.address;
  }

  /**
   * Get a public key.
   *
   * This call does not assume any path prefixes. Caller must indicate
   * whether hardened derivation is necessary. This method expects
   * the path to start from the root node, e.g. "m/44'/5353'/0'/0/0" or
   * [0x8000002c, 0x800014e9, 0x80000000, 0, 0]. Paths longer than the
   * BIP44 address level or paths using unhardened derivation at or
   * above the BIP44 account level will trigger an on-device warning.
   * @async
   * @param {(String|Number[])} path - full derivation path
   * @param {Object} options
   * @param {Number} options.confirm - true for on-device confirmation
   * @returns {Buffer} public key
   * @throws {LedgerError}
   */

  async getPublicKey(path, options) {
    this.logger.debug('Invoked getPublicKey');

    assert(this.device, 'Device must be initialized.');
    assert(this.ledger, 'LedgerClient must be initialized.');
    assert(path);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    assert(Array.isArray(path), 'path must be String or Array');

    if (!options) {
      options = Object.create(null);
      options.confirm = false;
    }

    assert(typeof options.confirm === 'boolean',
      'options.confirm must be a Boolean');

    options.xpub = false;
    options.address = false;

    const data = await this.ledger.getPublicKey(path, options);

    return data.publicKey;
  }

  /**
   * Sign transaction with lock.
   * @async
   * @param {hsd.MTX|Buffer} mtx - mutable transaction
   * @param {LedgerInput[]?} inputs - Ledger aware inputs
   * @returns {MTX}
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async signTransaction(mtx, inputs) {
    this.logger.debug('Invoked signTransaction');

    assert(this.device, 'Device must be initialized.');
    assert(this.ledger, 'LedgerClient must be initialized.');

    const unlock = await this.txlock.lock();

    try {
      const signatures = await this._getSignatures(mtx, inputs);
      const clone = mtx.clone();
      clone.view = mtx.view;

      for (const {index, input, signature} of signatures) {
        const check = this.applySignature(clone, index, input, signature);
        assert(check, 'Could not apply signature.');
      }

      return clone;
    } finally {
      unlock();
    }
  }

  /**
   * Get signatures for transaction. Signature ordering
   * matches the order of inputs in the mtx.inputs array.
   * @param {hsd.MTX} mtx - mutable transaction
   * @param {LedgerInput[]} inputs - Ledger aware inputs
   * @returns {Buffer[]}
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async getTransactionSignatures(mtx, inputs) {
    this.logger.debug('Invoked getTransactionSignatures');

    assert(this.device, 'Device must be initialized.');
    assert(this.ledger, 'LedgerClient must be initialized.');

    const unlock = await this.txlock.lock();

    try {
      const signatures = await this._getSignatures(mtx, inputs);
      const sigs = [];

      for (const {signature} of signatures)
        sigs.push(signature);

      return sigs;
    } finally {
      unlock();
    }
  }

  /**
   * Get signatures from the Ledger device.
   * @private
   * @param {hsd.MTX|Buffer} mtx - mutable transaction
   * @param {LedgerInput[]?} inputs - Ledger aware inputs
   * @returns {Buffer[]}
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async _getSignatures(mtx, inputs) {
    if (!inputs) {
      inputs = [];

      for (const input of mtx.inputs) {
        const coin = mtx.view.getCoinFor(input);
        const path = mtx.view.getPathFor(input);

        inputs.push(new LedgerInput({
          coin: coin,
          path: path.toPath(this.network)
        }));
      }
    }

    const signer = LedgerSigner.fromOptions({
      ledger: this.ledger,
      mtx,
      inputs
    });

    try {
      await signer.init();

      const signatures = new Array(inputs.length);

      for (const input of inputs) {
        const index = signer.getIndex(input.toKey());
        const {signature} = await signer.signInput(input.toKey());

        // Even though we can return multiple signatures at once,
        // when signing the same input several times we enforce that
        // this function is called more than once.
        assert(!signatures[index], 'Cannot sign the same input twice.');
        signatures[index] = {index, input, signature};
      }

      return signatures;
    } finally {
      signer.destroy();
    }
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

LedgerHSD.params = LedgerClient.params;

module.exports = LedgerHSD;
