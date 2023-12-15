/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const rules = require('hsd/lib/covenants/rules');
const {LedgerChange, LedgerCovenant, LedgerInput} = require('../..');
const {TestUtil} = require('../utils/utils.js');

async function createLedgerChange(util, wid, mtx) {
  let i, key;

  for (i = mtx.outputs.length - 1; i >= 0; i--) {
    const output = mtx.outputs[i];
    const addr = output.address.toString(util.network.type);
    key = await util.walletClient.getKey(wid, addr);

    if (key && key.branch)
      break;
  }

  assert.ok(key && key.branch, 'expected change address');

  const {account, branch, index} = key;
  const coinType = util.network.keyPrefix.coinType;
  return new LedgerChange({
    path: `m/44'/${coinType}'/${account}'/${branch}/${index}`,
    index: i,
    version: 0
  });
}

describe('Ledger Nano', function() {
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
      let change = await createLedgerChange(util, alice.wallet.id, mtx);
      let signed = await util.signTransaction(mtx, {change});
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
      change = await createLedgerChange(util, bob.wallet.id, mtx);
      signed = await util.signTransaction(mtx, {change});
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

  describe('Signing covenants', () => {
    const name = rules.grindName(2, 0, util.network);;
    const covenants = [new LedgerCovenant({index: 0, name})];

    it('should submit OPEN', async () => {
      // Submit OPEN.
      const mtx = await util.createOpen(name);
      const change = await createLedgerChange(util, bob.wallet.id, mtx);
      const signed = await util.signTransaction(mtx, {covenants, change});
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
      let change = await createLedgerChange(util, alice.wallet.id, mtx);
      let signed = await util.signTransaction(mtx, {covenants, change});
      const txid = signed.txid();
      await util.sendRawTX(signed);

      // Submit losing BID.
      await util.selectWallet(bob.wallet.id);
      mtx = await util.createBid(name, 4, 10);
      change = await createLedgerChange(util, bob.wallet.id, mtx);
      signed = await util.signTransaction(mtx, {covenants, change});
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
      let change = await createLedgerChange(util, alice.wallet.id, mtx);
      let signed = await util.signTransaction(mtx, {covenants, change});
      const txid = signed.txid();
      await util.sendRawTX(signed);

      // Submit losing REVEAL.
      await util.selectWallet(bob.wallet.id);
      mtx = await util.createReveal(name);
      change = await createLedgerChange(util, bob.wallet.id, mtx);
      signed = await util.signTransaction(mtx, {covenants, change});
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
      const change = await createLedgerChange(util, bob.wallet.id, mtx);
      const signed = await util.signTransaction(mtx, {covenants, change});
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

      const bytes =[
        'ce6cfbd5f11a36d141d5afd14a9c8450887a47496f57a6deb74348298de2abe6',
        '88acd75bd26983566fa705b7d043f1557ec50a1e09001686afecce17eea6d4db',
        '4ae549736eff518cac613be4233b5f29aaf00d8f3f23001305ad0238902c922e',
        'e982a186b38af45d612e56262eace181985dab1e8170474327dcf6804d342a0b'
      ];

      const mtx = await util.createUpdate(name, {
        records: [{type: 'TXT', txt: bytes}]
      });
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
          publicKey: publicKey
        }));
      }
      const change = await createLedgerChange(util, alice.wallet.id, mtx);
      const options = {inputs, covenants, change};
      const signed = await util.signTransaction(mtx, options, name);
      await util.sendRawTX(signed);

      // Mine REGISTER.
      await util.generateToAddress(1, alice.addr);
      await util.confirmTX(mtx.txid());

      // Assert REGISTER.
      const n = await util.getNameInfo(name);
      const got = n.info.data;
      const want =
        '00060440636536636662643566313161333664313431643561666431346139633834' +
        '35303838376134373439366635376136646562373433343832393864653261626536' +
        '40383861636437356264323639383335363666613730356237643034336631353537' +
        '65633530613165303930303136383661666563636531376565613664346462403461' +
        '65353439373336656666353138636163363133626534323333623566323961616630' +
        '30643866336632333030313330356164303233383930326339323265406539383261' +
        '31383662333861663435643631326535363236326561636531383139383564616231' +
        '65383137303437343332376463663638303464333432613062';
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
      const change = await createLedgerChange(util, alice.wallet.id, mtx);
      const signed = await util.signTransaction(mtx, {covenants, change});
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
      const change = await createLedgerChange(util, alice.wallet.id, mtx);
      const signed = await util.signTransaction(mtx, {covenants, change});
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
      const change = await createLedgerChange(util, alice.wallet.id, mtx);
      const signed = await util.signTransaction(mtx, {covenants, change});
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
      let change = await createLedgerChange(util, alice.wallet.id, mtx);
      let signed = await util.signTransaction(mtx, {covenants, change});
      await util.sendRawTX(signed);

      // Mine TRANSFER and past the lockup period.
      const ids = await util.generateToAddress(util.transferLockup, alice.addr);
      await util.confirmBlock(ids.pop());

      // Submit FINALIZE.
      mtx = await util.createFinalize(name);
      change = await createLedgerChange(util, alice.wallet.id, mtx);
      signed = await util.signTransaction(mtx, {covenants, change});
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
      const change = await createLedgerChange(util, bob.wallet.id, mtx);
      const signed = await util.signTransaction(mtx, {covenants, change});
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
