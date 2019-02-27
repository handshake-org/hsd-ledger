/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('assert');
const Logger = require('blgr');
const walletPlugin = require('hsd/lib/wallet/plugin');
const { Amount, MTX, FullNode } = require('hsd');
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

  async signTransaction(mtx, msg) {
    if (msg)
      this.logger.info(msg);

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


describe('Ledger Nano S', function() {
  this.timeout(60000);

  let alice, bob, util;

  before(async () => {
    util = new TestUtil();
    await util.open();

    // Create first wallet.
    alice = Object.create(null);
    alice.xpub = await util.ledger.getAccountXPUB(0);
    alice.wallet = await util.createWallet(null, {
      watchOnly: true,
      accountKey: alice.xpub.xpubkey(util.network)
    });
    alice.acct = await util.getAccount(alice.wallet.id, 'default');
    alice.addr = alice.acct.receiveAddress;

    // Fund first wallet.
    await util.selectWallet(alice.wallet.id);
    await util.generateToAddress(3, alice.addr);
    util.wait(500);

    // Create second wallet.
    bob = Object.create(null);
    bob.xpub = await util.ledger.getAccountXPUB(1);
    bob.wallet = await util.createWallet(null, {
      watchOnly: true,
      accountKey: bob.xpub.xpubkey(util.network)
    });
    bob.acct = await util.getAccount(bob.wallet.id, 'default');
    bob.addr = bob.acct.receiveAddress;

    // Fund second wallet.
    await util.generateToAddress(3, bob.addr);
    util.wait(500);
  });

  after(async () => {
    await util.close();
  });

  describe('Signing regular transactions', () => {
    it('should spend p2pkh output', async () => {
      // Create send from first wallet to second.
      await util.selectWallet(alice.wallet.id);
      let mtx = await util.createSendToAddress('default', bob.addr, 1900);
      let msg = `Confirm TXID: ${mtx.txid()}`;
      let signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Mine send.
      await util.generateToAddress(1, alice.addr);
      util.wait(500);

      // Create send from second wallet back to the first.
      await util.selectWallet(bob.wallet.id);
      mtx = await util.createSendToAddress('default', alice.addr, 1800);
      msg = `Confirm TXID: ${mtx.txid()}`;
      signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Check balance before send.
      let acct = await util.getAccount(bob.wallet.id, 'default');
      const before = acct.balance.unconfirmed;
      // Mine send.
      await util.generateToAddress(1, alice.addr);
      util.wait(500);

      // Assert balance before send.
      acct = await util.getAccount(bob.wallet.id, 'default');
      const after = acct.balance.unconfirmed;
      assert.ok(before > after, 'send failed');
    });
  });

  describe('Signing covenants', async () => {
    let name;

    it(`should submit OPEN`, async () => {
      name = await util.grindName(3);

      // Submit OPEN.
      const mtx = await util.createOpen(name);
      const msg = `Confirm OPEN TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);
      await util.generateToAddress(1, alice.addr);

      // Assert OPEN.
      const n = await util.getNameInfo(name);
      assert.deepEqual(n.info.state, 'OPENING', 'wrong state');
    });

    it('should submit BID', async () => {
      // Advance past the open period.
      await util.generateToAddress(7, alice.addr);
      util.wait(500);

      // Submit winning BID.
      await util.selectWallet(alice.wallet.id);
      let mtx = await util.createBid(name, 5, 10);
      let msg = `Confirm winning BID TXID: ${mtx.txid()}`;
      let signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Submit losing BID.
      await util.selectWallet(bob.wallet.id);
      mtx = await util.createBid(name, 4, 10);
      msg = `Confirm losing BID TXID: ${mtx.txid()}`;
      signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Mine BID.
      await util.generateToAddress(1, alice.addr);
      util.wait(500);

      // Assert BID covenants.
      const info = await util.getAuctionInfo(name);
      assert.deepEqual(info.bids.length, 2, 'wrong number of bids');
    });

    it('should submit REVEAL', async () => {
      // Advance past the bidding period.
      await util.generateToAddress(5, alice.addr);
      util.wait(500);

      // Submit winning REVEAL.
      await util.selectWallet(alice.wallet.id);
      let mtx = await util.createReveal(name);
      let msg = `Confirm winning REVEAL TXID: ${mtx.txid()}`;
      let signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Submit losing REVEAL.
      await util.selectWallet(bob.wallet.id);
      mtx = await util.createReveal(name);
      msg = `Confirm losing REVEAL TXID: ${mtx.txid()}`;
      signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Mine REVEAL covenants.
      await util.generateToAddress(1, alice.addr);
      util.wait(500);

      // Assert REVEAL covenants.
      const info = await util.getAuctionInfo(name);
      assert.deepEqual(info.reveals.length, 2, 'wrong number of bids');
    });

    it('should submit REDEEM', async () => {
      // Advance past the reveal period.
      await util.generateToAddress(10, alice.addr);
      util.wait(500);

      // Submit REDEEM.
      await util.selectWallet(bob.wallet.id);
      const mtx = await util.createRedeem(name);
      const msg = `Confirm REDEEM TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Assert lockup.
      const before = await util.getAccount(bob.wallet.id, bob.acct.name);
      assert.ok(before.balance.lockedConfirmed);

      // Mine REDEEM.
      await util.generateToAddress(1, alice.addr);
      util.wait(500);

      // Assert REDEEM.
      const after = await util.getAccount(bob.wallet.id, bob.acct.name);
      assert.ok(!after.balance.lockedConfirmed);
    });

    it('should submit REGISTER', async () => {
      // Submit REGISTER.
      await util.selectWallet(alice.wallet.id);
      const text = Buffer.alloc(100).toString('hex');
      const mtx = await util.createUpdate(name, {
        version: 0,
        ttl: 6000,
        compat: true,
        canonical: 'example.com'
      });
      const msg = `Confirm REGISTER TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Mine REGISTER.
      await util.generateToAddress(1, alice.addr);
      util.wait(500);

      // Assert REGISTER.
      const n = await util.getNameInfo(name);
      const got = n.info.data;
      const want = '00805d000705076578616d706c6503636f6d00';
      assert.deepEqual(got, want, 'wrong data');
    });

    it('should submit createRenewal', async () => {
      // Advance 10 blocks.
      await util.generateToAddress(10, alice.addr);
      util.wait(500);

      // Check name expiration.
      const before = await util.getNameInfo(name);
      const had = before.info.stats.blocksUntilExpire;

      // Submit RENEWAL.
      await util.selectWallet(alice.wallet.id);
      const mtx = await util.createRenewal(name);
      const msg = `Confirm RENEWAL TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Mine RENEWAL.
      await util.generateToAddress(1, alice.addr);
      util.wait(500);

      // Assert RENEWAL.
      const after = await util.getNameInfo(name);
      const got = after.info.stats.blocksUntilExpire;
      assert.ok(got > had, 'wrong name expiry');
    });

    it('should submit TRANSFER', async () => {
      // Submit TRANSFER.
      const mtx = await util.createTransfer(name, bob.addr);
      const msg = `Confirm TRANSFER TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Mine TRANSFER.
      await util.generateToAddress(1, alice.addr);
      util.wait(500);

      // Assert TRANSFER.
      const n = await util.getNameInfo(name);
      assert.ok(n.info.transfer, 'wrong transfer');
    });

    it('Should submit TRANSFER cancellation', async () => {
      // Submit cancellation.
      const mtx = await util.createCancel(name);
      const msg = `Confirm TRANSFER cancellation TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Mine cancellation.
      await util.generateToAddress(1, alice.addr);
      util.wait(500);

      // Assert cancellation.
      const n = await util.getNameInfo(name);
      assert.ok(!n.info.transfer, 'wrong transfer');
    });

    it('should submit FINALIZE', async () => {
      // Submit TRANSFER.
      let mtx = await util.createTransfer(name, bob.addr);
      let msg = `Confirm TRANSFER TXID: ${mtx.txid()}`;
      let signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Mine TRANSFER and past the lockup period.
      await util.generateToAddress(11, alice.addr);
      util.wait(500);

      // Submit FINALIZE.
      mtx = await util.createFinalize(name);
      msg = `Confirm FINALIZE TXID: ${mtx.txid()}`;
      signed = await util.signTransaction(mtx, msg);
      const txid = await util.sendRawTX(signed);

      // Mine FINALIZE.
      await util.generateToAddress(1, alice.addr);
      util.wait(500);

      // Assert FINALIZE.
      const n = await util.getNameInfo(name);
      const got = n.info.owner;
      const want = { hash: txid, index: 0 };
      assert.deepEqual(got, want, 'wrong transfer');
    });

    it('should submit REVOKE', async () => {
      // Submit REVOKE.
      await util.selectWallet(bob.wallet.id);
      const mtx = await util.createRevoke(name);
      const msg = `Confirm REVOKE TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, msg);
      await util.sendRawTX(signed);

      // Mine REVOKE and advance past revocation delay.
      await util.generateToAddress(51, alice.addr);
      util.wait(500);

      // Assert REVOKE.
      const n = await util.getNameInfo(name);
      assert.ok(n.info.revoked, 'wrong revoke');
    });
  });
});
