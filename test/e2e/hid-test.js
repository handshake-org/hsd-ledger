/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const {
  Address, Amount, Coin, HDPublicKey, HDPrivateKey, KeyRing, MTX, Script
} = require('hsd');

const assert = require('../utils/assert');
const fundUtil = require('../utils/fund');
const util = require('../../lib/utils/util');
const {HID, LedgerHSD, LedgerInput} = require('../../lib/hsd-ledger');
const {Device, DeviceInfo} = HID;

const ACCOUNT = `m/44'/5355'/0'`;
const ADDRESS = `${ACCOUNT}/0/0`;
const CHANGE = `${ACCOUNT}/1/0`;
const SEED_PHRASE = [
  'abandon abandon abandon abandon',
  'abandon abandon abandon abandon',
  'abandon abandon abandon about'
].join(' ');

describe('HID', function () {
  this.timeout(Number(process.env.DEVICE_TIMEOUT) || 60000);

  it('should list devices', async () => {
    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device');

    for (const device of devices)
      assert.ok(DeviceInfo.isLedgerDevice(device),
        'Device should be a Ledger device');
  });
});

describe('LedgerHSD', function () {
  const timeout = Number(process.env.DEVICE_TIMEOUT) || 60000;
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

  describe('getAccountXPUB()', () => {
    it('should derive account xpub', async () => {
      const got = await ledger.getAccountXPUB(0);
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

  describe('getXPUB()', () => {
    it('should derive xpub', async () => {
      const got = await ledger.getXPUB(ACCOUNT);
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
      const got = await ledger.getPublicKey(ADDRESS);
      const want = getPublicKey(ADDRESS);

      assert.bufferEqual(got, want, 'address mismatch');
    });
  });

  describe('signTransaction()', () => {
    it('should return valid signatures on p2pkh inputs', async () => {
      const addrPub = await ledger.getPublicKey(ADDRESS);
      const changePub = await ledger.getPublicKey(CHANGE);
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
      console.log(`\tConfirm TXID: ${mtx.txid()}`);
      const signed = await ledger.signTransaction(mtx, [ledgerInput]);

      assert.ok(signed.verify(), 'validation failed');
    });

    it('should return valid signatures on p2sh inputs', async () => {
      // Using 6 pubkeys so the redeem script
      // exceeds the limit for one APDU message.
      const signers = [
        { acct: 0, path: `m/44'/5355'/0'/0/0` },
        { acct: 1, path: `m/44'/5355'/1'/0/0` },
        { acct: 2, path: `m/44'/5355'/2'/0/0` },
        { acct: 3, path: `m/44'/5355'/3'/0/0` },
        { acct: 4, path: `m/44'/5355'/4'/0/0` },
        { acct: 5, path: `m/44'/5355'/5'/0/0` },
      ];

      console.log(`\tConstructing multisig address.`);

      for (const signer of signers)
        signer.pub = await ledger.getPublicKey(signer.path);

      const [m, n] = [2, signers.length];
      const redeem = Script.fromMultisig(m, n, [
        signers[0].pub,
        signers[1].pub,
        signers[2].pub,
        signers[3].pub,
        signers[4].pub,
        signers[5].pub,
      ]);
      const address = Address.fromScript(redeem);
      const changeAddress = Address.fromScript(redeem);

      console.log('\tConstructing spend transaction.');

      const {coins, txs} = await fundUtil.fundAddress(address, 1);
      const mtx = new MTX();
      const value = Amount.fromCoins(1).toValue();

      mtx.addOutput({ address, value });

      await mtx.fund(coins, { changeAddress });

      const ledgerInputs = [];
      const coin = Coin.fromTX(txs[0], 0, -1);

      ledgerInputs.push(new LedgerInput({
        path: signers[0].path,
        coin,
        redeem
      }));

      ledgerInputs.push(new LedgerInput({
        path: signers[1].path,
        coin,
        redeem
      }));

      console.log(`\tConfirm TXID: ${mtx.txid()}`);

      const part = await ledger.signTransaction(mtx, [ledgerInputs[0]]);

      assert.ok(!part.verify(), 'validation should failed');

      console.log(`\tConfirm TXID: ${mtx.txid()}`);

      const full = await ledger.signTransaction(part, [ledgerInputs[1]]);

      assert.ok(full.verify(), 'validation failed');
    });
  });
});

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
