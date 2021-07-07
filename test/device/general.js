/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const {
  Address, Amount, Coin, HDPrivateKey, KeyRing, MTX, Script
} = require('hsd');

const assert = require('bsert');
const fundUtil = require('../utils/fund');
const util = require('../../lib/utils/util');
const Logger = require('blgr');
const {LedgerHSD, LedgerInput, LedgerChange} = require('../../lib/hsd-ledger');

const ACCOUNT = 'm/44\'/5355\'/0\'';
const ADDRESS = `${ACCOUNT}/0/0`;
const CHANGE = `${ACCOUNT}/1/0`;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const SEED_PHRASE = [
  'abandon abandon abandon abandon',
  'abandon abandon abandon abandon',
  'abandon abandon abandon about'
].join(' ');

module.exports = function (Device) {
  describe('LedgerHSD', function () {
    const timeout = Number(process.env.DEVICE_TIMEOUT) || 60000;
    const network = 'regtest';
    let device, ledger, logger;

    this.timeout(timeout);

    before(async () => {
      const devices = await Device.getDevices();

      logger = new Logger({
        console: true,
        level: LOG_LEVEL
      });

      await logger.open();

      device = devices[0];

      device.set({
        timeout,
        logger
      });

      await device.open();

      ledger = new LedgerHSD({
        device,
        network,
        logger
      });
    });

    after(async () => {
      await device.close();
      await logger.close();
    });

    describe('getAppVersion()', () => {
      it('should return version', async () => {
        const got = await ledger.getAppVersion();
        const want = '1.0.5';

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
        const mtx = await createTX(coins, addr, change);
        const ledgerInput = new LedgerInput({
          input: mtx.inputs[0],
          index: 0,
          path: 'm/44\'/5355\'/0\'/0/0',
          coin: Coin.fromTX(txs[0], 0, -1),
          publicKey: addrPub
        });

        // TODO(boymanjor): update details display.
        const options = {
          inputs: [ledgerInput],
          change: new LedgerChange({index: 1, version: 0, path: CHANGE})
        };

        logger.info(`Verify TX details: ${mtx.txid()}`);
        util.displayDetails(logger, network, mtx, options);
        const signed = await ledger.signTransaction(mtx, options);
        assert.ok(signed.verify(), 'validation failed');
      });

      it('should return valid signatures on p2sh inputs', async () => {
        // Using 6 pubkeys so the redeem script
        // exceeds the limit for one APDU message.
        const signers = [
          { acct: 0, path: 'm/44\'/5355\'/0\'/0/0' },
          { acct: 1, path: 'm/44\'/5355\'/1\'/0/0' },
          { acct: 2, path: 'm/44\'/5355\'/2\'/0/0' },
          { acct: 3, path: 'm/44\'/5355\'/3\'/0/0' },
          { acct: 4, path: 'm/44\'/5355\'/4\'/0/0' },
          { acct: 5, path: 'm/44\'/5355\'/5\'/0/0' }
        ];

        logger.info('Constructing multisig address.');

        for (const signer of signers)
          signer.pub = await ledger.getPublicKey(signer.path);

        const [m, n] = [2, signers.length];
        const redeem = Script.fromMultisig(m, n, [
          signers[0].pub,
          signers[1].pub,
          signers[2].pub,
          signers[3].pub,
          signers[4].pub,
          signers[5].pub
        ]);
        const address = Address.fromScript(redeem);
        const changeAddress = Address.fromScript(redeem);

        logger.info('Constructing spend transaction.');

        const {coins, txs} = await fundUtil.fundAddress(address, 1);
        const mtx = new MTX();
        const value = Amount.fromCoins(1).toValue();

        mtx.addOutput({ address, value });

        await mtx.fund(coins, {changeAddress});

        const ledgerInputs = [];
        const coin = Coin.fromTX(txs[0], 0, -1);

        ledgerInputs.push(new LedgerInput({
          input: mtx.inputs[0],
          index: 0,
          path: signers[0].path,
          publicKey: signers[0].pub,
          coin,
          redeem
        }));

        ledgerInputs.push(new LedgerInput({
          input: mtx.inputs[0],
          index: 0,
          path: signers[1].path,
          publicKey: signers[1].pub,
          coin,
          redeem
        }));

        let options = {inputs: [ledgerInputs[0]]};
        logger.info(`Verify TX details (1st signer): ${mtx.txid()}`);
        util.displayDetails(logger, network, mtx, options);
        const part = await ledger.signTransaction(mtx, options);
        assert.ok(!part.verify(), 'validation should failed');

        options = {inputs: [ledgerInputs[1]]};
        logger.info(`Verify TX details (2nd signer): ${mtx.txid()}`);
        util.displayDetails(logger, network, mtx, options);
        const full = await ledger.signTransaction(part, options);
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

    // Require a change output
    value -= parseInt(value / 10);

    mtx.addOutput({ value, address });

    await mtx.fund(coins, { subtractFee, changeAddress });

    return mtx;
  }
};
