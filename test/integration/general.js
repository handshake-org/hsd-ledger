/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('../util/assert');
const fundUtil = require('../util/fund');

const {LedgerHSD, LedgerInput} = require('../../lib/hns-ledger');

const KeyRing = require('hsd/lib/primitives/keyring');
const MTX = require('hsd/lib/primitives/mtx');
const {hashType} = require('hsd/lib/script/script');

const DEVICE_TIMEOUT = Number(process.env.DEVICE_TIMEOUT) || 15000;
const ACCOUNT = `m/44'/0'/0'`;
const PATH1 = `${ACCOUNT}/0/0`;
const PATH2 = `${ACCOUNT}/1/0`;

module.exports = function (Device, DeviceInfo) {
  describe('Device Integration Tests', function () {
    this.timeout(DEVICE_TIMEOUT);

    let ledger, device, network;

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
      ledger = new LedgerHSD({ device });
      network = 'regtest';
    });

    it('should derive xpub', async () => {
      const path = ACCOUNT;
      const xpub = await ledger.getXpub(path);

      // derive addresses
      const paths = {};

      // derive according to bip44
      for (let i = 0; i < 2; i++) {
        const newPath = `${path}/0/${i}`;
        const pubkey = xpub.derive(0).derive(i);
        paths[newPath] = pubkey;
      }

      for (const path of Object.keys(paths)) {
        const want = paths[path];
        const got = await ledger.getXpub(path);
        console.log(path);

        assert.strictEqual(want.depth, got.depth,
          'depth did not match');
        assert.strictEqual(want.childIndex, got.childIndex,
          'childIndex did not match');
        assert.bufferEqual(want.chainCode, got.chainCode,
          'chainCode did not match');
        assert.bufferEqual(want.publicKey, got.publicKey,
          'publicKey did not match');
      }
    });
  });
};

/*
 * Helpers
 */

function ringFromHD(hd) {
  return KeyRing.fromPublic(hd.publicKey);
}

function addrFromHD(hd, network) {
  return KeyRing.fromPublic(hd.publicKey, network).getAddress(network);
}

async function createTX(coins, addr, change) {
  const mtx = new MTX();

  let totalAmount = 0;

  for (const coin of coins)
    totalAmount += coin.value;

  mtx.addOutput({
    value: totalAmount,
    address: addr
  });

  await mtx.fund(coins, {
    subtractFee: true,
    changeAddress: change
  });

  return mtx;
}
