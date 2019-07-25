/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const rules = require('hsd/lib/covenants/rules');
const {hashType} = require('hsd/lib/script/common');
const {LedgerInput} = require('../..');
const {TestUtil} = require('../utils/utils.js');

describe('Ledger Nano S', function() {
  this.timeout(60000);

  const util = new TestUtil();
  let alice, bob;

  before(async () => {
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
    let hashes = await util.generateToAddress(3, alice.addr);
    await util.confirmBlock(hashes.pop());

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
    hashes = await util.generateToAddress(3, bob.addr);
    await util.confirmBlock(hashes.pop());
  });

  after(async () => {
    await util.close();
  });

  describe('Signing p2pkh transactions', () => {
    it('should spend p2pkh output', async () => {
      // Create send from first wallet to second.
      await util.selectWallet(alice.wallet.id);
      let mtx = await util.createSendToAddress('default', bob.addr, 1900);
      let msg = `Confirm first spend TXID: ${mtx.txid()}`;
      let signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Mine send.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(mtx.txid());

      // Check balance before send.
      let acct = await util.getAccount(bob.wallet.id, 'default');
      const before = acct.balance.unconfirmed;

      // Create send from second wallet back to the first.
      await util.selectWallet(bob.wallet.id);
      mtx = await util.createSendToAddress('default', alice.addr, 1800);
      msg = `Confirm second spend TXID: ${mtx.txid()}`;
      signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Mine send.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(mtx.txid());

      // Assert balance has updated.
      acct = await util.getAccount(bob.wallet.id, 'default');
      const after = acct.balance.unconfirmed;
      assert.ok(before > after, 'send failed');
    });
  });

  describe('Signing covenants', async () => {
    const name = rules.grindName(2, 0, util.network);;

    it('should submit OPEN', async () => {
      // Submit OPEN.
      const mtx = await util.createOpen(name);
      const msg = `Confirm OPEN TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Mine OPEN.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(mtx.txid());

      // Assert OPEN.
      const n = await util.getNameInfo(name);
      assert.deepEqual(n.info.state, 'OPENING', 'wrong state');
    });

    it('should submit BID', async () => {
      // Advance past the open period.
      const ids = await util.generateToAddress(util.treeInterval, alice.addr);
      await util.confirmBlock(ids.pop());

      // Submit winning BID.
      await util.selectWallet(alice.wallet.id);
      let mtx = await util.createBid(name, 5, 10);
      const txid = mtx.txid();
      let msg = `Confirm winning BID TXID: ${mtx.txid()}`;
      let signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Submit losing BID.
      await util.selectWallet(bob.wallet.id);
      mtx = await util.createBid(name, 4, 10);
      msg = `Confirm losing BID TXID: ${mtx.txid()}`;
      signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Mine BID covenants.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(mtx.txid());
      await util.confirmTX(txid);

      // Assert BID covenants.
      const info = await util.getAuctionInfo(name);
      assert.deepEqual(info.bids.length, 2, 'wrong number of bids');
    });

    it('should submit REVEAL', async () => {
      // Advance past the bidding period.
      const ids = await util.generateToAddress(util.biddingPeriod, alice.addr);
      await util.confirmBlock(ids.pop());

      // Submit winning REVEAL.
      await util.selectWallet(alice.wallet.id);
      let mtx = await util.createReveal(name);
      const txid = mtx.txid();
      let msg = `Confirm winning REVEAL TXID: ${mtx.txid()}`;
      let signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Submit losing REVEAL.
      await util.selectWallet(bob.wallet.id);
      mtx = await util.createReveal(name);
      msg = `Confirm losing REVEAL TXID: ${mtx.txid()}`;
      signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Mine REVEAL covenants.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(mtx.txid());
      await util.confirmTX(txid);

      // Assert REVEAL covenants.
      const info = await util.getAuctionInfo(name);
      assert.deepEqual(info.reveals.length, 2, 'wrong number of reveals');
    });

    it('should submit REDEEM', async () => {
      // Advance past the reveal period.
      const ids = await util.generateToAddress(util.revealPeriod, alice.addr);
      await util.confirmBlock(ids.pop());

      // Submit REDEEM.
      await util.selectWallet(bob.wallet.id);
      const mtx = await util.createRedeem(name);
      const msg = `Confirm REDEEM TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Assert lockup.
      const before = await util.getAccount(bob.wallet.id, bob.acct.name);
      assert.ok(before.balance.lockedConfirmed);

      // Mine REDEEM.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(mtx.txid());

      // Assert REDEEM.
      const after = await util.getAccount(bob.wallet.id, bob.acct.name);
      assert.ok(!after.balance.lockedConfirmed);
    });

    it('should submit REGISTER', async () => {
      // Submit REGISTER.
      await util.selectWallet(alice.wallet.id);

      // Use 256b txt record to also test that SIGHASH_SINGLE parsing
      // code works over mulitple APDU messages.
      // TODO(boymanjor): make this into its own test.
      const bytes =[
        'ce6cfbd5f11a36d141d5afd14a9c8450887a47496f57a6deb74348298de2abe6',
        '88acd75bd26983566fa705b7d043f1557ec50a1e09001686afecce17eea6d4db',
        '4ae549736eff518cac613be4233b5f29aaf00d8f3f23001305ad0238902c922e',
        'e982a186b38af45d612e56262eace181985dab1e8170474327dcf6804d342a0b'
      ];

      const mtx = await util.createUpdate(name, {
        version: 0,
        ttl: 6000,
        compat: true,
        text: bytes
      });
      const msg = `Confirm REGISTER TXID: ${mtx.txid()}`;
      const inputs = [];
      for (let i = 0; i <  mtx.inputs.length; i++) {
        const input = mtx.inputs[i];
        const coin = mtx.view.getCoinFor(input);
        const pathObject = mtx.view.getPathFor(input);
        const path = pathObject.toPath(util.network);
        const publicKey = await util.ledger.getPublicKey(path);
        inputs.push(new LedgerInput({
          input: input,
          index: i,
          coin: coin,
          path: path,
          publicKey: publicKey,
          type: hashType.SINGLE
        }));
      }
      const signed = await util.signTransaction(mtx, inputs, msg);
      await util.sendRawTX(signed);

      // Mine REGISTER.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(mtx.txid());

      // Assert REGISTER.
      const n = await util.getNameInfo(name);
      const got = n.info.data;
      const want =
        '00805d04406365366366626435663131613336643134316435616664313461396338' +
        '34353038383761343734393666353761366465623734333438323938646532616265' +
        '36403838616364373562643236393833353636666137303562376430343366313535' +
        '37656335306131653039303031363836616665636365313765656136643464624034' +
        '61653534393733366566663531386361633631336265343233336235663239616166' +
        '30306438663366323330303133303561643032333839303263393232654065393832' +
        '61313836623338616634356436313265353632363265616365313831393835646162' +
        '31653831373034373433323764636636383034643334326130620d01800d01810d01' +
        '820d0183';
      assert.deepEqual(got, want, 'wrong data');
    });

    it('should submit RENEW', async () => {
      // Advance 10 blocks.
      const hashes = await util.generateToAddress(10, alice.addr);
      await util.confirmBlock(hashes.pop());

      // Check name expiration.
      const before = await util.getNameInfo(name);
      const had = before.info.stats.blocksUntilExpire;

      // Submit RENEW.
      await util.selectWallet(alice.wallet.id);
      const mtx = await util.createRenewal(name);
      const msg = `Confirm RENEWAL TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Mine RENEW.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(mtx.txid());

      // Assert RENEW.
      const after = await util.getNameInfo(name);
      const got = after.info.stats.blocksUntilExpire;
      assert.ok(got > had, 'wrong name expiry');
    });

    it('should submit TRANSFER', async () => {
      // Submit TRANSFER.
      const mtx = await util.createTransfer(name, bob.addr);
      const msg = `Confirm TRANSFER TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Mine TRANSFER.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(mtx.txid());

      // Assert TRANSFER.
      const n = await util.getNameInfo(name);
      assert.ok(n.info.transfer, 'wrong transfer');
    });

    it('Should submit TRANSFER cancellation', async () => {
      // Submit cancellation.
      const mtx = await util.createCancel(name);
      const msg = `Confirm TRANSFER cancellation TXID: ${mtx.txid()}`;
      const signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Mine cancellation.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(mtx.txid());

      // Assert cancellation.
      const n = await util.getNameInfo(name);
      assert.ok(!n.info.transfer, 'wrong transfer');
    });

    it('should submit FINALIZE', async () => {
      // Submit TRANSFER.
      let mtx = await util.createTransfer(name, bob.addr);
      let msg = `Confirm TRANSFER TXID: ${mtx.txid()}`;
      let signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Mine TRANSFER and past the lockup period.
      const ids = await util.generateToAddress(util.transferLockup, alice.addr);
      await util.confirmBlock(ids.pop());

      // Submit FINALIZE.
      mtx = await util.createFinalize(name);
      msg = `Confirm FINALIZE TXID: ${mtx.txid()}`;
      signed = await util.signTransaction(mtx, null, msg);
      const txid = await util.sendRawTX(signed);

      // Mine FINALIZE.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(txid);

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
      const signed = await util.signTransaction(mtx, null, msg);
      await util.sendRawTX(signed);

      // Mine REVOKE and advance past revocation delay.
      const revocationDelay = util.revocationDelay;
      const ids = await util.generateToAddress(revocationDelay, alice.addr);
      await util.confirmBlock(ids.pop());

      // Assert REVOKE.
      const n = await util.getNameInfo(name);
      assert.ok(n.info.revoked, 'wrong revoke');
    });
  });
});
