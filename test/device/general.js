/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const {
  Address,
  Coin,
  HDPublicKey,
  HDPrivateKey,
  KeyRing,
  MTX
} = require('hsd');

const assert = require('../utils/assert');
const fundUtil = require('../utils/fund');
const util = require('../../lib/utils/util');
const {LedgerHSD, LedgerInput} = require('../../lib/hns-ledger');

const ACCOUNT = `m/44'/5355'/0'`;
const ADDRESS = `${ACCOUNT}/0/0`;
const CHANGE = `${ACCOUNT}/1/0`;
const SEED_PHRASE = [
  'abandon abandon abandon abandon',
  'abandon abandon abandon abandon',
  'abandon abandon abandon about'
].join(' ');

module.exports = function (Device, DeviceInfo) {
  describe('LedgerHSD', function () {
    const timeout = Number(process.env.DEVICE_TIMEOUT) || 15000;
    const network = 'regtest';
    let device, ledger;

    this.timeout(timeout);

    before(async () => {
      const devices = await Device.getDevices();

      device = new Device({
        device: devices[0],
        timeout: timeout
      });

      await device.open();
    });

    after(async () => await device.close());

    beforeEach(() => {
      ledger = new LedgerHSD({ device, network });
    });

    describe('getAppVersion()', () => {
      it('should return version', async () => {
        const got = await ledger.getAppVersion();
        const want = '0.1.0';

        assert.strictEqual(got, want, 'version mismatch');
      });
    });

    describe('getAccountXpub()', () => {
      it('should derive account xpub', async () => {
        const got = await ledger.getAccountXpub(0);
        const want = getAccountXPUB(0);

        assert.strictEqual(got.depth, want.depth,
          'depth mismatch');
        assert.strictEqual(got.childIndex, want.childIndex,
          'childIndex mismatch');
        assert.strictEqual(got.parentFingerPrint, want.parentFingerPrint,
          'parentFingerPrint mismatch');
        assert.bufferEqual(got.publicKey, want.publicKey,
          'publicKey mismatch');
        assert.bufferEqual(got.chainCode, want.chainCode,
          'chainCode mismatch');
      });
    });

    describe('getXpub()', () => {
      it('should derive xpub', async () => {
        const got = await ledger.getXpub(ACCOUNT);
        const want = getXPUB(ACCOUNT);

        assert.strictEqual(got.depth, want.depth,
          'depth mismatch');
        assert.strictEqual(got.childIndex, want.childIndex,
          'childIndex mismatch');
        assert.strictEqual(got.parentFingerPrint, want.parentFingerPrint,
          'parentFingerPrint mismatch');
        assert.bufferEqual(got.chainCode, want.chainCode,
          'chainCode mismatch');
        assert.bufferEqual(got.publicKey, want.publicKey,
          'publicKey mismatch');
      });
    });

    describe('getAddress()', () => {
      it('should derive address', async () => {
        const got = await ledger.getAddress(0, 0, 0);
        const want = getAddress(ADDRESS);

        assert.deepEqual(got, want, 'address mismatch');
      });
    });

    describe('getPublicKey()', () => {
      it('should derive public key', async () => {
        const got = await ledger.getPublicKey(0, 0, 0);
        const want = getPublicKey(ADDRESS);

        assert.bufferEqual(got, want, 'address mismatch');
      });
    });

    describe('signTransaction()', () => {
      it('should signatures on p2pkh inputs', async () => {
        const addrPub = await ledger.getPublicKey(0, 0, 0, false);
        const changePub = await ledger.getPublicKey(0, 1, 0, false);
        const addrRing = await KeyRing.fromPublic(addrPub);
        const changeRing = await KeyRing.fromPublic(changePub);
        const addr = addrRing.getAddress();
        const change = changeRing.getAddress();
        const {coins, txs} = await fundUtil.fundAddress(addr, 1);
        const mtx = await createTX(coins, addr, change)
        const ledgerInput = new LedgerInput({
          path: `m/44'/5355'/0'/0/0`,
          coin: Coin.fromTX(txs[0], 0, -1)
        });
        console.log(`\tconfirm txid: ${mtx.txid()}`);
        const signed = await ledger.signTransaction(mtx, [ledgerInput]);

        assert.ok(signed.verify(), 'validation failed');
      });
    });
  });
};

/*
 * Helpers
 */

function getAccountXPUB(index) {
  return HDPrivateKey.fromPhrase(SEED_PHRASE)
    .deriveAccount(44, 5355, index)
    .toPublic();
}

function getXPUB(path) {
  // Build an array of hashes storing
  // BIP44 index and harden information.
  const build = (index) => {
    let harden = false;

    if (index & util.HARDENED) {
      harden = true;
      index ^= util.HARDENED;

      return { harden, index };
    }

    return { harden, index };
  };

  let key = HDPrivateKey.fromPhrase(SEED_PHRASE);
  path = util.parsePath(path, true).map(build);

  for (let i = 0; i < path.length; i++) {
    key = key.derive(path[i].index, path[i].harden);
  }

  return key.toPublic();
}

function getAddress(path) {
  const xpub = getXPUB(path);
  return Address.fromPubkey(xpub.publicKey).toString('regtest');
}

function getPublicKey(path) {
  const xpub = getXPUB(path);
  return xpub.publicKey;
}

function ringFromHD(hd) {
  return KeyRing.fromPublic(hd.publicKey);
}

function addrFromHD(hd, network) {
  return KeyRing.fromPublic(hd.publicKey, network).getAddress(network);
}

async function createTX(coins, address, changeAddress) {
  const mtx = new MTX();
  const subtractFee = true;

  let value = 0;

  for (const coin of coins)
    value += coin.value;

  mtx.addOutput({ value, address });

  await mtx.fund(coins, { subtractFee, changeAddress });

  return mtx;
}
