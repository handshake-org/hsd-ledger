'use strict';

const assert = require('assert');
const hsd = require('hsd');
const hnsledger = require('../../lib/hns-ledger');
const { LedgerHSD } = hnsledger;
const { Device } = hnsledger.HID;
const { NodeClient, WalletClient } = require('hs-client');

class TestError extends Error {

  /**
   * Create a Test error.
   * @param {Number} code
   * @param {String} msg
   */

  constructor(suite, test, msg) {
    super();

    assert(typeof suite === 'string');
    assert(typeof test === 'string');
    assert(typeof msg === 'string');

    this.testsuite = suite;
    this.test = test;
    this.message = msg;

    if (Error.captureStackTrace)
      Error.captureStackTrace(this, TestError);
  }
}

class Test {
  constructor(host) {
    this.wid = 'primary';
    this.nodeClient = new NodeClient({ host, port: 14037 });
    this.walletClient = new WalletClient({ host, port: 14039 });
  }

  /**
   * Ensure a promise is rejected.
   * @param {Promise} promise
   * @returns {Promise} Returns the expected error or a rejected promise.
   */

  async mustRPC(promise, name) {
    return promise.then(([res, err]) => {
      if (err)
        return Promise.reject(
          new TestError(this.constructor.name, name, err.message));

      return res;
    });
  }

  /**
   * Ensure a promise is rejected.
   * @param {Promise} promise
   * @returns {Promise} Returns the expected error or a rejected promise.
   */

  async mustAPI(promise, name) {
    return promise.then(res => {
      return res;
    })
    .catch(err => {
      return Promise.reject(
        new TestError(this.constructor.name, name, err.message));
    });
  }

  /**
   * Ensure a promise is rejected.
   * @param {Promise} promise
   * @returns {Promise} Returns the expected error or a rejected promise.
   */

  async cantRPC(promise, name) {
    return promise.then(([res, err]) => {
      if (res)
        return Promise.reject(
          new TestError(this.constructor.name, name, 'Expected failure'));

      return err;
    });
  }

  /**
   * Ensure a promise is rejected.
   * @param {Promise} promise
   * @returns {Promise} Returns the expected error or a rejected promise.
   */

  async cantAPI(promise, name) {
    return promise.then(res => {
      return Promise.reject(
        new TestError(this.constructor.name, name, 'Expected failure'));
    })
    .catch(err => err);
  }

  /**
   * Execute an rpc using the wallet client.
   * @param {String}  method - rpc method
   * @param {Array}   params - method parameters
   * @returns {Promise} - Returns a two item array with the rpc's return value
   * or null as the first item and an error or null as the second item.
   */

  async execWalletRPC(method, params = []) {
    return this.walletClient.execute(method, params)
      .then(data => [data, null])
      .catch(err => [null, err]);
  }

  /**
   * Execute an rpc using the node client.
   * @param {String}  method - rpc method
   * @param {Array}   params - method parameters
   * @returns {Promise} - Returns a two item array with the rpc's return value
   * or null as the first item and an error or null as the second item.
   */

  async execNodeRPC(method, params = []) {
    return this.nodeClient.execute(method, params)
      .then(data => [data, null])
      .catch(err => [null, err]);
  }

  /**
   * Block the main thread.
   * @param {Number} ms - amount of ms to block.
   */

  wait(ms) {
    const start = Date.now();
    while (Date.now() - start < 1000);
  }
}

class MultisigTest extends Test {
  constructor(host) {
    super(host);
    this.id = 'multisig-test';
  }

  async init() {
    const acc = await this.mustAPI(
      this.walletClient.createAccount(this.wid, this.id + Math.floor(Math.random() * 1000000)), 'init');

    this.coinbaseAddress = acc.receiveAddress;
  }

  // TODO(boymanjor): adapt to use Ledger Nano S
  async testMultisigSpend() {
    const name = 'testMultisigSpend';

    // mine some blocks to get funds in the coinbase address
    let blocks = await this.mustRPC(
      this.execNodeRPC('generatetoaddress', [2, this.coinbaseAddress]), name);

    // send coins to multisig
    let [txid0] = await this.execWalletRPC('sendtoaddress', [process.env.MULTI, 500], name);

    // mine a block
    blocks = await this.mustRPC(
      this.execNodeRPC('generatetoaddress', [1, this.coinbaseAddress]), name);

    // import three privkeys
    const ring1 = hsd.KeyRing.fromSecret(process.env.PRV1);
    const ring2 = hsd.KeyRing.fromSecret(process.env.PRV2);
    const ring3 = hsd.KeyRing.fromSecret(process.env.PRV3);

    const m = 2;
    const n = 3;

    const pubkey1 = ring1.publicKey;
    const pubkey2 = ring2.publicKey;
    const pubkey3 = ring3.publicKey;
    const redeem = hsd.Script.fromMultisig(m, n, [pubkey1, pubkey2, pubkey3]);

    const sendTo = process.env.MULTI;
    const txInfo = {
      value: hsd.Amount.fromCoins('500').toValue(),
      address: sendTo,
      hash: txid0,
      index: 0
    }

    const coin = hsd.Coin.fromJSON({
      version: 1,
      height: -1,
      value: txInfo.value,
      address: txInfo.address,
      coinbase: false,
      hash: txInfo.hash,
      index: txInfo.index
    }, 'regtest');

    // mine some blocks
    blocks = await this.mustRPC(
      this.execNodeRPC('generatetoaddress', [2, this.coinbaseAddress]), name);

    // spend coins from multisig to coinbase address: signmessagewithprivkey
    const spend = new hsd.MTX();
    // spend
    spend.addOutput({
      address: sendTo,
      value: hsd.Amount.fromCoins('250').toValue()
    });

    // change
    spend.addOutput({
      address: sendTo,
      value: hsd.Amount.fromCoins('250').toValue()
    });


    ring1.script = redeem;
    spend.addCoin(coin);
    spend.scriptInput(0, coin, ring1);
    spend.signInput(0, coin, ring1);

    ring2.script = redeem;
    // spend.signInput(0, coin, ring2);

    ring3.script = redeem;
    spend.signInput(0, coin, ring3);

    assert(spend.verify());
  }

  async run() {
    await this.init();
    await this.testMultisigSpend();
  }
}

class LedgerTest extends Test {
  constructor(host) {
    super(host);
    this.id = 'ledger-test';
  }

  async initLedger() {
    const devices = await Device.getDevices();

    this.device = new Device({
      device: devices[0],
      timeout: 60000
    });

    await this.device.open();

    return new LedgerHSD({
      device: this.device,
      network: 'regtest'
    });
  }

  async createWallet(ledger, index) {
    const id = this.id + Math.floor(Math.random(0) * 1000000).toString(10);
    const xpub = await ledger.getAccountXpub(index);
    const options = {
      watchOnly: true,
      accountKey: xpub.xpubkey('regtest')
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

    return hsd.MTX.fromJSON(json);
  }

  async send(mtx) {
    const encode = mtx.encode().toString('hex');
    return await this.mustRPC(
      this.execNodeRPC('sendrawtransaction', [encode]), 'LedgerTest.mine');
  }

  async run() {
    try {
      console.log(`Initializing Ledger connection...`);

      let ledger = await this.initLedger();

      console.log(`Creating wallet a...`);

      let wallet_a = await this.createWallet(ledger, 0);
      let a = await ledger.getAddress(0, 0, 0);

      console.log(`Creating wallet b...`);

      let wallet_b = await this.createWallet(ledger, 1);
      let b = await ledger.getAddress(1, 0, 0);

      console.log(`Mining to address in wallet a...`);

      await this.selectWallet(wallet_a);
      await this.mine(a, 3);

      console.log(`Creating send from wallet a to b...`);

      await this.selectWallet(wallet_a);
      let mtx = await this.createSendToAddress('0', b, 1900);

      console.log(`Signing transaction with Ledger.`);
      console.log(`Tx hash is ${mtx.txid()}.`);

      let signed = await ledger.signTransaction(mtx);
      let result = await this.send(signed);

      console.log(`Mining to address in wallet a...`);

      await this.mine(a, 1);

      console.log(`Creating send from wallet b to a...`);

      await this.selectWallet(wallet_b);
      mtx = await this.createSendToAddress('0', a, 1700);

      console.log(`Signing transaction with Ledger.`);
      console.log(`Tx hash is ${mtx.txid()}.`);

      signed = await ledger.signTransaction(mtx);
      result = await this.send(signed);

      console.log(`Mining to address in wallet a...`);
      this.mine(a, 1);
    } catch(err) {
      throw(err);
    } finally {
      this.device.close();
    }
  }
}

// Run tests
(async function(){
  try {
    await new LedgerTest('127.0.0.1').run();
    console.log('Tests finished successfully.');
  } catch (err) {
    console.log(err);
  }
}());
