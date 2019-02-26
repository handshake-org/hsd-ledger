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

console.log(id);

    if (shouldFail) {
      return this.cantAPI(
        this.walletClient.createWallet(id, options), 'createWallet');
    }

    return this.mustAPI(
      this.walletClient.createWallet(id, options), 'createWallet');
  }

  async selectWallet(id) {
    await this.mustRPC(
      this.execWalletRPC('selectwallet', [id]), 'selectWallet');
  }

  async createAccount(id, name, options) {
    return this.mustAPI(
      this.walletClient.createAccount(id, name, options), 'createAccount');
  }

  async getAccount(id, account) {
    const acct = await this.mustAPI(
      this.walletClient.getAccount(id, account), 'getAccount');

    if (!acct) {
      throw new TestUtilError({
        message: 'Account not found',
        caller: 'getAccount'
      });
    }

    return acct;
  }

  async createSendToAddress(id, addr, amt) {
    const json = await this.mustRPC(
      this.execWalletRPC('createsendtoaddress',
        [addr, amt, "", "", false, id]), 'createSendToAddress');

    return MTX.fromJSON(json);
  }

  async sendRawTX(mtx) {
    if (!mtx.verify()) {
      throw new TestUtilError({
        message: 'TX signature is invalid.',
        caller: 'sendRawTX'
      });
    }

    const encode = mtx.encode().toString('hex');

    return this.mustRPC(
      this.execNodeRPC('sendrawtransaction', [encode]), 'sendRawTX');
  }

  async generateToAddress(addr, n, pause = 1000) {
    await this.mustRPC(this.execNodeRPC('generatetoaddress', [n, addr]));
    await this.wait(pause);
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

  describe('createsendtoaddress', () => {
    it('should create valid signature', async () => {
      // Create first wallet.
      const xpub0 = await util.ledger.getAccountXPUB(0);
      const wid0 = await util.createWallet('id', {
        watchOnly: true,
        accountKey: xpub0.xpubkey(util.network)
      });
console.log(wid0);
      const acct0 = await util.getAccount(wid0, 'default');
      const addr0 = acct0.receiveAddress;

      // Create second wallet.
      const xpub1 = await util.ledger.getAccountXPUB(1);
      const wid1 = await util.createWallet('id', {
        watchOnly: true,
        accountKey: xpub1.xpubkey(util.network)
      });
      const acct1 = await util.getAccount(wid1, 'default');
      const addr1 = acct1.receiveAddress;

      // Fund first wallet.
      await util.selectWallet(wid0);
      await util.generateToAddress(addr0, 3);

      // Create send from first wallet to second.
      let mtx = await util.createSendToAddress('default', addr1, 1900);
      let signed = await util.ledger.signTransaction(mtx);
      await util.sendRawTX(signed);
      await util.generateToAddress(addr0, 1);

      // Create send from second wallet back to the first.
      await util.selectWallet(wid1);
      mtx = await util.createSendToAddress('default', addr0, 1800);
      signed = await util.ledger.signTransaction(mtx);
      await util.sendRawTX(signed);
      await util.generateToAddress(addr0, 1);
    });
  });
});
