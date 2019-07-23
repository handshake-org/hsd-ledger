'use strict';

const assert = require('assert');
const bio = require('bufio');
const plugin = require('hsd/lib/wallet/plugin');
const Logger = require('blgr');
const {ChainEntry, FullNode, MTX, Network} = require('hsd');
const {NodeClient, WalletClient} = require('hs-client');
const {HID, LedgerHSD} = require('../../lib/hsd-ledger');
const {Device} = HID;

const network = Network.get('regtest');
const {
  treeInterval,
  biddingPeriod,
  revealPeriod,
  transferLockup,
  revocationDelay
} = network.names;

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

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

    this.txs = {};
    this.blocks = {};
    this.network = network;
    this.treeInterval = treeInterval;
    this.biddingPeriod = biddingPeriod;
    this.revealPeriod = revealPeriod;
    this.transferLockup = transferLockup;
    this.revocationDelay = revocationDelay;

    this.node = new FullNode({
      memory: true,
      workers: true,
      network: 'regtest'
    });

    this.node.use(plugin);

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
      level: LOG_LEVEL
    });
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
    return promise.then((res) => {
      return res;
    })
    .catch((err) => {
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
    return promise.then((res) => {
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

    const devices = await Device.getDevices();

    this.device = new Device({
      device: devices[0],
      timeout: 60000,
      logger: this.logger
    });

    await this.device.open();
    await this.node.ensure();
    await this.node.open();
    await this.node.connect();
    this.node.startSync();

    await this.nodeClient.open();
    await this.walletClient.open();

    this.node.plugins.walletdb.wdb.on('confirmed', (details, tx) => {
      const txid = tx.txid();

      if (!this.txs[txid]) {
        this.txs[txid] = 1;
      } else if (this.txs[txid] === 1) {
        this.txs[txid] = 2;
      } else {
        throw(new TestUtilError({ message: 'error', caller: 'cb' }));
      }
    });

    this.nodeClient.bind('block connect', (data) => {
      const br = bio.read(data);
      const entry = (new ChainEntry()).read(br);
       const hash = entry.hash.toString('hex');

      if (!this.blocks[hash]) {
        this.blocks[hash] = 1;
      } else if (this.blocks[hash] === 1) {
        this.blocks[hash] = 2;
      } else {
        throw(new TestUtilError({ message: 'error', caller: 'cb' }));
      }
    });

    this.ledger = new LedgerHSD({
      device: this.device,
      network: this.network.type,
      logger: this.logger
    });
  }

  /**
   * Close test and all its child objects.
   */

  async close() {
    assert(this.opened, 'TestUtil is not open.');
    this.opened = false;

    await this.logger.close();
    await this.device.close();
    await this.nodeClient.close();
    await this.walletClient.close();
    await this.node.close();
  }

  async confirmTX(txid, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const stop = setInterval(() => {
        if (this.txs.hasOwnProperty(txid)) {
          clearInterval(stop);
          resolve(txid);
        }
      }, 500);

      setTimeout(() => {
        clearInterval(stop);
        reject(null);
      }, timeout);
    });
  }

  async confirmBlock(hash, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const stop = setInterval(() => {
        if (this.blocks.hasOwnProperty(hash)) {
          clearInterval(stop);
          resolve(hash);
        }
      }, 500);

      setTimeout(() => {
        clearInterval(stop);
        reject(null);
      }, timeout);
    });
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

    const message = 'Account not found.';
    const caller = 'getAccount';

    if (failed && shouldFail)
      return new TestUtilError({ message, caller });

    if (failed && !shouldFail)
      return this.reject(message, caller);

    if (shouldFail)
      return this.reject('Expected failure.', caller);

    return acct;
  }

  async createSendToAddress(id, addr, amt, shouldFail) {
    const args = [addr, amt, '', '', false, id];
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

  async grindName(size, shouldFail) {
    const args = [size];
    const promise = this.execNodeRPC('grindname', args);
    const caller = 'grindName';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    return this.mustRPC(promise, caller);
  }

  async getAuctionInfo(name, shouldFail) {
    const args = [name];
    const promise = this.execWalletRPC('getauctioninfo', args);
    const caller = 'getAuctionInfo';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    return this.mustRPC(promise, caller);
  }

  async getNameInfo(name, shouldFail) {
    const args = [name];
    const promise = this.execNodeRPC('getnameinfo', args);
    const caller = 'getNameInfo';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    return this.mustRPC(promise, caller);
  }

  async createClaim(name, shouldFail) {
    const args = [name];
    const promise = this.execWalletRPC('createclaim', args);
    const caller = 'createClaim';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    return this.mustRPC(promise, caller);
  }

  async createOpen(name, force, account, shouldFail) {
    const args = [name, force, account];
    const promise = this.execWalletRPC('createopen', args);
    const caller = 'createOpen';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    const json = await this.mustRPC(promise, caller);

    return MTX.fromJSON(json);
  }

  async createBid(name, bid, value, account, shouldFail) {
    const args = [name, bid, value, account];
    const promise = this.execWalletRPC('createbid', args);
    const caller = 'createBid';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    const json = await this.mustRPC(promise, caller);

    return MTX.fromJSON(json);
  }

  async createReveal(name, account, shouldFail) {
    const args = [name, account];
    const promise = this.execWalletRPC('createreveal', args);
    const caller = 'createReveal';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    const json = await this.mustRPC(promise, caller);

    return MTX.fromJSON(json);
  }

  async createRedeem(name, account, shouldFail) {
    const args = [name, account];
    const promise = this.execWalletRPC('createredeem', args);
    const caller = 'createRedeem';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    const json = await this.mustRPC(promise, caller);

    return MTX.fromJSON(json);
  }

  async createUpdate(name, data, account, shouldFail) {
    const args = [name, data, account];
    const promise = this.execWalletRPC('createupdate', args);
    const caller = 'createUpdate';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    const json = await this.mustRPC(promise, caller);

    return MTX.fromJSON(json);
  }

  async createRenewal(name, account, shouldFail) {
    const args = [name, account];
    const promise = this.execWalletRPC('createrenewal', args);
    const caller = 'createRenewal';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    const json = await this.mustRPC(promise, caller);

    return MTX.fromJSON(json);
  }

  async createTransfer(name, address, account, shouldFail) {
    const args = [name, address, account];
    const promise = this.execWalletRPC('createtransfer', args);
    const caller = 'createTransfer';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    const json = await this.mustRPC(promise, caller);

    return MTX.fromJSON(json);
  }

  async createCancel(name, account, shouldFail) {
    const args = [name, account];
    const promise = this.execWalletRPC('createcancel', args);
    const caller = 'createCancel';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    const json = await this.mustRPC(promise, caller);

    return MTX.fromJSON(json);
  }

  async createFinalize(name, account, shouldFail) {
    const args = [name, account];
    const promise = this.execWalletRPC('createfinalize', args);
    const caller = 'createFinalize';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    const json = await this.mustRPC(promise, caller);

    return MTX.fromJSON(json);
  }

  async createRevoke(name, account, shouldFail) {
    const args = [name, account];
    const promise = this.execWalletRPC('createrevoke', args);
    const caller = 'createRevoke';

    if (shouldFail)
      return this.cantRPC(promise, caller);

    const json = await this.mustRPC(promise, caller);

    return MTX.fromJSON(json);
  }

  /**
   * Logs TXID before signing transaction with Ledger Nanos S.
   */

  async signTransaction(mtx, inputs, msg) {
    if (msg)
      this.logger.info(msg);

    return this.ledger.signTransaction(mtx, inputs);
  }

  /**
   * Logs TXID before signing transaction with Ledger Nanos S.
   */

  async getTransactionSignatures(mtx, inputs, msg) {
    if (msg)
      this.logger.info(msg);

    return this.ledger.getTransactionSignatures(mtx, inputs);
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

exports.TestUtilError = TestUtilError;
exports.TestUtil = TestUtil;
