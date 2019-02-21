'use strict';

const assert = require('assert');
const Logger = require('blgr');
const fs = require('fs');
const os = require('os');
const path = require('path');
const walletPlugin = require('hsd/lib/wallet/plugin');
const { MTX, FullNode } = require('hsd');
const { NodeClient, WalletClient } = require('hs-client');
const { HID, LedgerHSD } = require('../../lib/hns-ledger');
const { Device } = HID;

class TestError extends Error {

  /**
   * Create a Test error.
   * @param {Number} code
   * @param {String} msg
   */

  constructor(options) {
    super();

    assert(typeof options.suite === 'string');
    assert(typeof options.test === 'string');
    assert(typeof options.message === 'string');

    this.suite = options.suite;
    this.test = options.test;
    this.message = options.message;

    if (Error.captureStackTrace)
      Error.captureStackTrace(this, TestError);
  }
}

class TestSuite {
  constructor(options) {
    if (!options.wid)
      options.wid = 'primary';

    if (!options.host)
      options.host = 'localhost';

    if (!options.nodePort)
      options.nodePort = 14037;

    if (!options.walletPort)
      options.walletPort = 14039;

    this.network = 'regtest';

    this.logger = new Logger({
      console: true,
      level: 'info'
    });

    this.wid = options.wid;

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
   * Ensure an RPC call succeeds.
   * @param {Promise} promise
   * @param {String} test - name of the test
   * @returns {Promise} Returns the expected result or a rejected promise.
   */

  async mustRPC(promise, test) {
    return promise.then(([res, err]) => {
      if (err)
        return this.reject(this.suite, test, err.message);

      return res;
    });
  }

  /**
   * Ensure an API call succeeds.
   * @param {Promise} promise
   * @param {String} test - name of the test
   * @returns {Promise} Returns the expected result or a rejected promise.
   */

  async mustAPI(promise, test) {
    return promise.then(res => {
      return res;
    })
    .catch(err => {
      return this.reject(this.suite, test, err.message);
    });
  }

  /**
   * Ensure an RPC call fails.
   * @param {Promise} promise
   * @param {String} test - name of the test
   * @returns {Promise} Returns the expected error or a rejected promise.
   */

  async cantRPC(promise, test) {
    return promise.then(([res, err]) => {
      if (res)
        return this.reject(this.suite, test, 'Expected failure.');

      return err;
    });
  }

  /**
   * Ensure an API call fails.
   * @param {Promise} promise
   * @param {String} test - name of the test
   * @returns {Promise} Returns the expected error or a rejected promise.
   */

  async cantAPI(promise, test) {
    return promise.then(res => {
      return this.reject(this.suite, test, 'Expected failure.');
    })
    .catch(err => err);
  }

  /**
   * Execute an RPC call using the wallet client.
   * @param {String}  method - RPC method
   * @param {Array}   params - method parameters
   * @returns {Promise} - Returns a two item array with the RPC call's return value
   * or null as the first item and an error or null as the second item.
   */

  async execWalletRPC(method, params = []) {
    return this.walletClient.execute(method, params)
      .then(data => [data, null])
      .catch(err => [null, err]);
  }

  /**
   * Execute an RPC call using the node client.
   * @param {String}  method - RPC method
   * @param {Array}   params - method parameters
   * @returns {Promise<Array>} - Returns a two item array with the RPC call's return value
   * or null as the first item and an error or null as the second item.
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
    assert(!this.opened, this.suite + ' is already open.');
    this.opened = true;

    await this.logger.open();
    await this.node.ensure();
    await this.node.open();
    await this.node.connect();

    const devices = await Device.getDevices();

    this.device = new Device({
      device: devices[0],
      timeout: 60000,
      logger: this.logger.context('device')
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
    assert(this.opened, this.suite + ' is not open.');
    this.opened = false;

    await this.node.close();
    await this.device.close();
  }

  /**
   * Construct a TestError to use in promise rejection.
   * @param {String} suite - the name of the test suite
   * @param {String} test - the name of the test
   * @param {String} message - the error message
   * @returns {Promise<TestError>}
   */

  reject(suite, test, message) {
    return Promise.reject(new TestError({ suite, test, message }));
  }

  /**
   * Block the main thread.
   * @param {Number} ms - amount of time to block in milliseconds
   */

  wait(ms) {
    const start = Date.now();
    while (Date.now() - start < 1000);
  }
}

class BasicSuite extends TestSuite {
  constructor(options) {
    super(options);
    this.id = 'ledger-test';
    this.suite = this.constructor.name;
    this.logger = this.logger.context(this.suite);
  }

  async createWallet(ledger, index) {
    const id = this.id + Math.floor(Math.random(0) * 1000000).toString(10);
    const xpub = await ledger.getAccountXpub(index);
    const options = {
      watchOnly: true,
      accountKey: xpub.xpubkey(this.network)
    };

    const wallet = await this.walletClient.createWallet(id, options);

    return id;
  }

  async selectWallet(id) {
    await this.mustRPC(
      this.execWalletRPC('selectwallet', [id]), 'Ledger.createWallet');
  }

  async getAccount(wallet, account) {
    return await this.walletClient.getAccount(wallet, account);
  }

  async mine(addr, n) {
    await this.mustRPC(
      this.execNodeRPC('generatetoaddress', [n, addr]), 'LedgerTest.mine');

    this.wait(1000);
  }

  async createSendToAddress(id, addr, amt) {
    const json = await this.mustRPC(
      this.execWalletRPC('createsendtoaddress', [addr, amt, "", "", false, id]), 'Ledger.createSend');

    return MTX.fromJSON(json);
  }

  async send(mtx) {
    const encode = mtx.encode().toString('hex');
    return await this.mustRPC(
      this.execNodeRPC('sendrawtransaction', [encode]), 'LedgerTest.mine');
  }

  async run() {
    try {
      this.logger.info(`Creating wallet a...`);

      let wallet_a = await this.createWallet(this.ledger, 0);
      let a = await this.ledger.getAddress(0, 0, 0);

      this.logger.info(`Creating wallet b...`);

      let wallet_b = await this.createWallet(this.ledger, 1);
      let b = await this.ledger.getAddress(1, 0, 0);

      this.logger.info(`Mining to address in wallet a...`);

      await this.selectWallet(wallet_a);
      await this.mine(a, 3);

      this.logger.info(`Creating send from wallet a to b...`);

      await this.selectWallet(wallet_a);
      let mtx = await this.createSendToAddress('default', b, 1900);

      this.logger.info(`Signing transaction with Ledger.`);
      this.logger.info(`Tx hash is ${mtx.txid()}.`);

      let signed = await this.ledger.signTransaction(mtx);
      let result = await this.send(signed);

      this.logger.info(`Mining to address in wallet a...`);

      await this.mine(a, 1);

      this.logger.info(`Creating send from wallet b to a...`);

      await this.selectWallet(wallet_b);
      mtx = await this.createSendToAddress('default', a, 1700);

      this.logger.info(`Signing transaction with Ledger.`);
      this.logger.info(`Tx hash is ${mtx.txid()}.`);

      signed = await this.ledger.signTransaction(mtx);
      result = await this.send(signed);

      this.logger.info(`Mining to address in wallet a...`);
      await this.mine(a, 1);
    } catch(err) {
      throw(err);
    }
  }
}

// Run tests
(async function(){
  const basic = new BasicSuite({});

  try {
    await basic.open();
    await basic.run();
    basic.logger.info('Tests finished successfully.');
  } catch (err) {
    basic.logger.error(err);
  } finally {
    await basic.close();
  }
}());
