/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('../util/assert');
const bledger = require('../../lib/bledger');
const fundUtil = require('../util/fund');

const KeyRing = require('bcoin/lib/primitives/keyring');
const MTX = require('bcoin/lib/primitives/mtx');
const Script = require('bcoin/lib/script/script');
const hashType = Script.hashType;

const {LedgerBcoin, LedgerTXInput} = bledger;
const ADDRESS = '3Bi9H1hzCHWJoFEjc4xzVzEMywi35dyvsV';

const DEVICE_TIMEOUT = Number(process.env.DEVICE_TIMEOUT) || 15000;

const m = 'm';
const ACCOUNT = `${m}/44'/0'/0'`;
const PATH1 = `${ACCOUNT}/0/0`;
const PATH2 = `${ACCOUNT}/1/0`;

module.exports = function (Device, DeviceInfo) {
  describe('General Device', function () {
    this.timeout(DEVICE_TIMEOUT);

    let bcoinApp, device;

    before(async () => {
      const devices = await Device.getDevices();

      device = new Device({
        device: devices[0],
        timeout: DEVICE_TIMEOUT
      });

      await device.open();
    });

    after(async () => await device.close());

    beforeEach(() => {
      bcoinApp = new LedgerBcoin({ device });
    });

    it('should get public key and correctly derive', async () => {
      const path = ACCOUNT;
      const xpubHD = await bcoinApp.getPublicKey(path);

      // derive addresses
      const paths = {};

      // derive according to bip44
      for (let i = 0; i < 2; i++) {
        const newPath = `${path}/0/${i}`;
        const pubkey = xpubHD.derive(0).derive(i);

        paths[newPath] = pubkey;
      }

      for (const path of Object.keys(paths)) {
        const derivedHD = paths[path];
        const pubHD = await bcoinApp.getPublicKey(path);

        assert.strictEqual(pubHD.depth, derivedHD.depth, 'depth did not match');
        assert.strictEqual(pubHD.childIndex, derivedHD.childIndex,
          'childIndex did not match'
        );
        assert.bufferEqual(pubHD.chainCode, derivedHD.chainCode,
          'chainCode did not match'
        );
        assert.bufferEqual(pubHD.publicKey, derivedHD.publicKey,
          'publicKey did not match'
        );
      }
    });

    it('should sign simple p2pkh transaction', async () => {
      const path = PATH1;
      const pubHD = await bcoinApp.getPublicKey(path);
      const addr = hd2addr(pubHD);

      const {txs} = await fundUtil.fundAddress(addr, 1);

      const ledgerInput = LedgerTXInput.fromOptions({
        path: path,
        tx: txs[0],
        index: 0
      });

      const tx = await createTX([ledgerInput.getCoin()], addr);

      assert.ok(!tx.verify(), 'Transaction does not need signing');

      await bcoinApp.signTransaction(tx, [ledgerInput]);

      assert.ok(tx.verify(), 'Transaction was not signed');
    });

    it('should sign simple p2sh transaction', async () => {
      const path1 = PATH1;
      const path2 = PATH2;

      const pubHD1 = await bcoinApp.getPublicKey(path1);
      const pubHD2 = await bcoinApp.getPublicKey(path2);

      const [pk1, pk2] = [pubHD1.publicKey, pubHD2.publicKey];
      const [m, n] = [2, 2];

      const multisigScript = Script.fromMultisig(m, n, [pk1, pk2]);

      const addr = multisigScript.getAddress().toBase58();

      const {txs} = await fundUtil.fundAddress(addr, 1);

      const ledgerInput1 = LedgerTXInput.fromOptions({
        path:  path1,
        tx: txs[0],
        index: 0,
        redeem: multisigScript,
        publicKey: pk1
      });

      const ledgerInput2 = LedgerTXInput.fromOptions({
        path: path2,
        tx: txs[0],
        index: 0,
        redeem: multisigScript,
        publicKey: pk2
      });

      const tx1 = await createTX([ledgerInput1.getCoin()], addr);

      await bcoinApp.signTransaction(tx1, [ledgerInput1]);
      await bcoinApp.signTransaction(tx1, [ledgerInput2]);

      assert(tx1.verify(), 'Transaction was not signed');

      // Or sign both together
      const tx2 = await createTX([ledgerInput1.getCoin()], addr);

      await bcoinApp.signTransaction(tx2, [ledgerInput1, ledgerInput2]);

      assert(tx2.verify(), 'Transaction was not signed');
    });

    it('should sign foreign ANYONECANPAY input p2pkh transaction', async () => {
      const path = PATH1;
      const pubHD = await bcoinApp.getPublicKey(path);
      const addr1 = hd2addr(pubHD);

      // generate another address
      const ring = KeyRing.generate(true);
      const addr2 = ring.getAddress();

      const txInfo1 = await fundUtil.fundAddress(addr1, 1);
      const txInfo2 = await fundUtil.fundAddress(addr2, 1);

      const ledgerInputs = [
        LedgerTXInput.fromOptions({
          path: path,
          tx: txInfo1.txs[0],
          index: 0
        })
      ];

      const coins1 = txInfo1.coins;
      const coins2 = txInfo2.coins;

      const mtx = await createTX(coins1.concat(coins2), addr1);

      mtx.sign(ring, hashType.ALL | hashType.ANYONECANPAY);

      await bcoinApp.signTransaction(mtx, ledgerInputs);

      assert(mtx.verify(), 'Transaction was not signed');
    });

    it('should sign simple P2WPKH transaction', async () => {
      const path = PATH1;
      const pubHD = await bcoinApp.getPublicKey(path);
      const addr1 = hd2bech32(pubHD);

      const {coins, txs} = await fundUtil.fundAddressFromWitness(addr1, 1);

      const ledgerInput = LedgerTXInput.fromOptions({
        path: path,
        tx: txs[0],
        index: 0,
        witness: true
      });

      const mtx = await createTX(coins, addr1);

      await bcoinApp.signTransaction(mtx, [ledgerInput]);

      assert(mtx.verify(), 'Transaction was not signed');
    });

    it('should sign standard P2WSH transaction', async () => {
      const path1 = PATH1;
      const path2 = PATH2;

      const pubHD1 = await bcoinApp.getPublicKey(path1);
      const pubHD2 = await bcoinApp.getPublicKey(path2);

      const [ring1, ring2] = [hd2ring(pubHD1), hd2ring(pubHD2)];

      ring1.witness = true;
      ring2.witness = true;

      const [pk1, pk2] = [ring1.publicKey, ring2.publicKey];
      const [m, n] = [2, 2];

      const multisigScript = Script.fromMultisig(m, n, [pk1, pk2]);

      ring1.script = multisigScript;

      const addr = ring1.getAddress();

      const {txs} = await fundUtil.fundAddress(addr, 1);

      const ledgerInput1 = LedgerTXInput.fromOptions({
        path:  path1,
        tx: txs[0],
        index: 0,
        redeem: multisigScript,
        witness: true,
        publicKey: pk1
      });

      const ledgerInput2 = LedgerTXInput.fromOptions({
        path: path2,
        tx: txs[0],
        index: 0,
        redeem: multisigScript,
        witness: true,
        publicKey: pk2
      });

      const tx1 = await createTX([ledgerInput1.getCoin()], addr);

      await bcoinApp.signTransaction(tx1, [ledgerInput1]);
      await bcoinApp.signTransaction(tx1, [ledgerInput2]);

      assert(tx1.verify(), 'Transaction was not signed');

      // Or sign both together
      const tx2 = await createTX([ledgerInput1.getCoin()], addr);

      await bcoinApp.signTransaction(tx2, [ledgerInput1, ledgerInput2]);

      assert(tx2.verify(), 'Transaction was not signed');
    });

    it('should sign nested P2WPKH transaction', async () => {
      const path = PATH1;
      const pubHD = await bcoinApp.getPublicKey(path);
      const ring = hd2ring(pubHD);
      ring.witness = true;

      const addr = ring.getNestedAddress();

      const {txs} = await fundUtil.fundAddress(addr, 1);

      const ledgerInput = LedgerTXInput.fromOptions({
        path: path,
        tx: txs[0],
        index: 0,
        witness: true
      });

      const coin = ledgerInput.getCoin();
      const tx = await createTX([coin], addr);

      assert.ok(!tx.verify(), 'Transaction must not be signed');

      await bcoinApp.signTransaction(tx, [ledgerInput]);

      assert.ok(tx.verify(), 'Transaction was not signed');
    });

    it('should sign nested P2WSH transaction', async () => {
      const path1 = PATH1;
      const path2 = PATH2;

      const pubHD1 = await bcoinApp.getPublicKey(path1);
      const pubHD2 = await bcoinApp.getPublicKey(path2);

      const [ring1, ring2] = [hd2ring(pubHD1), hd2ring(pubHD2)];

      ring1.witness = true;
      ring2.witness = true;

      const [pk1, pk2] = [ring1.publicKey, ring2.publicKey];
      const [m, n] = [2, 2];

      const multisigScript = Script.fromMultisig(m, n, [pk1, pk2]);

      ring1.script = multisigScript;

      const addr = ring1.getNestedAddress();

      const {txs} = await fundUtil.fundAddress(addr, 1);

      const ledgerInput1 = LedgerTXInput.fromOptions({
        path:  path1,
        tx: txs[0],
        index: 0,
        redeem: multisigScript,
        witness: true,
        publicKey: pk1
      });

      const ledgerInput2 = LedgerTXInput.fromOptions({
        path: path2,
        tx: txs[0],
        index: 0,
        redeem: multisigScript,
        witness: true,
        publicKey: pk2
      });

      const tx1 = await createTX([ledgerInput1.getCoin()], addr);

      await bcoinApp.signTransaction(tx1, [ledgerInput1]);
      await bcoinApp.signTransaction(tx1, [ledgerInput2]);

      assert(tx1.verify(), 'Transaction was not signed');

      // Or sign both together
      const tx2 = await createTX([ledgerInput1.getCoin()], addr);

      await bcoinApp.signTransaction(tx2, [ledgerInput1, ledgerInput2]);

      assert(tx2.verify(), 'Transaction was not signed');
      console.log(tx2);
    });
  });
};

/*
 * Helpers
 */

function hd2ring(hd) {
  return KeyRing.fromPublic(hd.publicKey);
}

function hd2addr(hd, network) {
  return KeyRing.fromPublic(hd.publicKey, network).getAddress(network);
}

function hd2bech32(hd, network) {
  const keyring = KeyRing.fromPublic(hd.publicKey);
  keyring.witness = true;

  return keyring.getAddress(network);
}

async function createTX(coins, changeAddress) {
  const mtx = new MTX();

  let totalAmount = 0;

  for (const coin of coins)
    totalAmount += coin.value;

  mtx.addOutput({
    value: totalAmount,
    address: ADDRESS
  });

  await mtx.fund(coins, {
    subtractFee: true,
    changeAddress: changeAddress
  });

  return mtx;
}
