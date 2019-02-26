/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('assert');
const Logger = require('blgr');
const walletPlugin = require('hsd/lib/wallet/plugin');
const { MTX, FullNode } = require('hsd');
const { NodeClient, WalletClient } = require('hs-client');
const { HID, LedgerHSD } = require('../../lib/hns-ledger');
const { Device } = HID;

class TestUtilError extends Error {

  /**
   * Create a Test error.
   * @param {Object} options
   * @param {String} options.error
   * @param {String} options.caller
   */

  constructor(options) {
    assert(typeof options.message === 'string');
    assert(typeof options.caller === 'string');

    super(options.message);

    this.name = `TestUtil.${options.caller}`;

    if (Error.captureStackTrace)
      Error.captureStackTrace(this, TestUtilError);
  }
}

class TestUtil {
  constructor(options) {
    if (!options)
      options = Object.create(null);

    if (!options.host)
      options.host = 'localhost';

    if (!options.nodePort)
      options.nodePort = 14037;

    if (!options.walletPort)
      options.walletPort = 14039;

    this.network = 'regtest';

    this.nodeClient = new NodeClient({
      host: options.host,
      port: options.nodePort
    });

    this.walletClient = new WalletClient({
      host: options.host,
      port: options.walletPort
    });

    this.logger = new Logger({
      console: true,
      level: 'info'
    });

    this.node = new FullNode({
      memory: true,
      workers: true,
      network: this.network,
      loader: require
    });

    this.node.use(walletPlugin);
  }

  /**
   * Ensure an RPC succeeds.
   * @param {Promise} promise
   * @param {String} caller
   * @returns {Promise} Returns the expected result or a rejected promise.
   */

  async mustRPC(promise, caller) {
    return promise.then(([res, err]) => {
      if (err)
        return this.reject(err.message, caller);

      return res;
    });
  }

  /**
   * Ensure an API call succeeds.
   * @param {Promise} promise
   * @param {String} caller
   * @returns {Promise} Returns the expected result or a rejected promise.
   */

  async mustAPI(promise, caller) {
    return promise.then(res => {
      return res;
    })
    .catch(err => {
      return this.reject(err.message, caller);
    });
  }

  /**
   * Ensure an RPC fails.
   * @param {Promise} promise
   * @param {String} caller
   * @returns {Promise} Returns the expected error or a rejected promise.
   */

  async cantRPC(promise, caller) {
    return promise.then(([res, err]) => {
      if (res)
        return this.reject('Expected failure.', caller);

      return err;
    });
  }

  /**
   * Ensure an API call fails.
   * @param {Promise} promise
   * @param {String} caller
   * @returns {Promise} Returns the expected error or a rejected promise.
   */

  async cantAPI(promise, caller) {
    return promise.then(res => {
      return this.reject('Expected failure.', caller);
    })
    .catch(err => err);
  }

  /**
   * Execute an RPC using the wallet client.
   * @param {String}  method - RPC method
   * @param {Array}   params - method parameters
   * @returns {Promise} - Returns a two item array with the RPC's return value
   * or null as the first item and an error or null as the second item.
   */

  async execWalletRPC(method, params = []) {
    return this.walletClient.execute(method, params)
      .then(data => [data, null])
      .catch(err => [null, err]);
  }

  /**
   * Execute an RPC using the node client.
   * @param {String}  method - RPC method
   * @param {Array}   params - method parameters
   * @returns {Promise<Array>} - Returns a two item array with the
   * RPC's return value or null as the first item and an error or
   * null as the second item.
   */

  async execNodeRPC(method, params = []) {
    return this.nodeClient.execute(method, params)
      .then(data => [data, null])
      .catch(err => [null, err]);
  }

  /**
   * Open the test and all its child objects.
   */

  async open() {
    assert(!this.opened, 'TestUtil is already open.');
    this.opened = true;

    await this.logger.open();
    await this.node.ensure();
    await this.node.open();
    await this.node.connect();

    const devices = await Device.getDevices();

    this.device = new Device({
      device: devices[0],
      timeout: 60000,
    });

    await this.device.open();

    this.ledger = new LedgerHSD({
      device: this.device,
      network: this.network
    });
  }

  /**
   * Close test and all its child objects.
   */

  async close() {
    assert(this.opened, 'TestUtil is not open.');
    this.opened = false;

    await this.logger.close();
    await this.node.close();
    await this.device.close();
  }

  /**
   * Block the main thread.
   * @param {Number} ms - amount of time to block in milliseconds
   */

  async wait(ms) {
    const start = Date.now();
    while (Date.now() - start < ms);
  }

  /**
   * Wrappers
   */

  async createWallet(id, options, shouldFail) {
    if (!id) {
      id = Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER));
      id = id.toString(10);
    }

    const promise = this.walletClient.createWallet(id, options);
    const caller = 'createWallet';

    if (shouldFail)
      return this.cantAPI(promise, caller);

    return this.mustAPI(promise, caller);
  }

  async selectWallet(id, shouldFail) {
    const promise = this.execWalletRPC('selectwallet', [id]);
    const caller = 'selectWallet';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    return this.mustRPC(promise, caller);
  }

  async createAccount(id, name, options, shouldFail) {
    if (!id) {
      id = Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER));
      id = id.toString(10);
    }

    const promise = this.walletClient.createAccount(id, name, options);
    const caller = 'createAccount';

    if (shouldFail)
      return this.cantAPI(promise, caller);

    return this.mustAPI(promise, caller);
  }

  async getAccount(id, account, shouldFail) {
    // getAccount does not return an error.
    const acct = await this.walletClient.getAccount(id, account);
    let failed = false;

    if (!acct)
      failed = true;

    const message = 'Account not found.'
    const caller = 'getAccount';

    if (failed && shouldFail)
      return new TestUtilError({ message, caller });

    if (failed && !shouldFail)
      return this.reject(message, caller)

    if (shouldFail)
      return this.reject('Expected failure.', caller);

    return acct;
  }

  async createSendToAddress(id, addr, amt, shouldFail) {
    const args = [addr, amt, "", "", false, id];
    const promise = this.execWalletRPC('createsendtoaddress', args);
    const caller = 'createSendToAddress';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    const json = await this.mustRPC(promise, caller);

    return MTX.fromJSON(json);
  }

  async sendRawTX(mtx, shouldFail) {
    const caller = 'sendRawTX';

    let message = null;

    if (!MTX.isMTX(mtx))
      message = 'mtx must be instance of MTX';

    if (!mtx.verify())
      message = 'TX signature is invalid.';

    if (message) {
      if (shouldFail)
        return new TestUtilError({ message, caller });

      return this.reject(message, caller);
    }

    const args = [mtx.encode().toString('hex')];
    const rpc = this.execNodeRPC('sendrawtransaction', args);

    return this.mustRPC(rpc, caller);
  }

  async generateToAddress(n, addr, shouldFail) {
    const args = [n, addr];
    const promise = this.execNodeRPC('generatetoaddress', args);
    const caller = 'generateToAddress';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    return this.mustRPC(promise, caller);
  }

  /**
   * Logs TXID before signing transaction with Ledger Nanos S.
   */

  async signTransaction(mtx) {
    this.logger.info(`Confirm TXID: ${mtx.txid()}`);

    return this.ledger.signTransaction(mtx);
  }

  /**
   * Construct a TestUtilError to use in promise rejection.
   * @param {String} error - the error
   * @param {String} caller - the function that threw the error
   * @returns {Promise<TestUtilError>}
   */

  reject(message, caller) {
    return Promise.reject(new TestUtilError({ message, caller }));
  }
}


describe('Hardware signing with Ledger Nano S', function() {
  const util = new TestUtil();
  this.timeout(60000);

  before(async () => {
    await util.open();
  });

  after(async () => {
    util.close();
  });

  describe('RPC: createsendtoaddress', () => {
    it('should create valid signature', async () => {
      // Create first wallet.
      const alice = Object.create(null);
      alice.xpub = await util.ledger.getAccountXPUB(0);
      alice.wallet = await util.createWallet(null, {
        watchOnly: true,
        accountKey: alice.xpub.xpubkey(util.network)
      });
      alice.acct = await util.getAccount(alice.wallet.id, 'default');
      alice.addr = alice.acct.receiveAddress;

      // Create second wallet.
      const bob = Object.create(null);
      bob.xpub = await util.ledger.getAccountXPUB(1);
      bob.wallet = await util.createWallet(null, {
        watchOnly: true,
        accountKey: bob.xpub.xpubkey(util.network)
      });
      bob.acct = await util.getAccount(bob.wallet.id, 'default');
      bob.addr = bob.acct.receiveAddress;

      // Fund first wallet.
      await util.generateToAddress(3, alice.addr);

      // Create send from first wallet to second.
      await util.selectWallet(alice.wallet.id);
      let mtx = await util.createSendToAddress('default', bob.addr, 1900);
      let signed = await util.signTransaction(mtx);
      await util.sendRawTX(signed);
      await util.generateToAddress(1, alice.addr);

      // Create send from second wallet back to the first.
      await util.selectWallet(bob.wallet.id);
      mtx = await util.createSendToAddress('default', alice.addr, 1800);
      signed = await util.signTransaction(mtx);
      await util.sendRawTX(signed);
      await util.generateToAddress(1, alice.addr);
    });
  });
});
