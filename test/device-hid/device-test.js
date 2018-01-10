/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('../util/assert');
const bledger = require('../../lib/bledger');
const fundUtil = require('../util/fund');

const KeyRing = require('bcoin/lib/primitives/keyring');
const MTX = require('bcoin/lib/primitives/mtx');

const {Device, DeviceInfo} = bledger.hid;
const {LedgerBcoin, LedgerTXInput} = bledger;

const DEVICE_TIMEOUT = Number(process.env.DEVICE_TIMEOUT) || 15000;
const ADDRESS = '3Bi9H1hzCHWJoFEjc4xzVzEMywi35dyvsV';

describe('HID Device', function () {
  this.timeout(DEVICE_TIMEOUT);

  let bcoinApp;

  const devices = Device.getDevices();
  const device = new Device({
    device: devices[0],
    timeout: DEVICE_TIMEOUT
  });

  device.open();

  after(() => device.close());

  beforeEach(() => {
    bcoinApp = new LedgerBcoin({ device });
  });

  it('should list devices', () => {
    const devices = Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device');

    for (const device of devices)
      assert.ok(DeviceInfo.isLedgerDevice(device),
        'Device should be a ledger device');
  });

  it('should get public key and correctly derive', async () => {
    const path = 'm/44\'/0\'/0\'';
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
    const path = 'm/44\'/0\'/0\'/0/0';
    const pubHD = await bcoinApp.getPublicKey(path);
    const addr = hd2addr(pubHD);

    const {txs} = await fundUtil.fundAddress(addr, 1);

    // return
    const inputs = [
      LedgerTXInput.fromOptions({
        path: path,
        tx: txs[0],
        index: 0
      })
    ];

    const tx = await createTX(inputs, addr);

    assert.ok(!tx.verify(), 'Transaction does not need signing');

    await bcoinApp.signTransaction(tx, inputs);

    assert.ok(tx.verify(), 'Transaction was not signed');
  });
});

/*
 * Helpers
 */

function hd2addr(hd, network) {
  return KeyRing.fromPublic(hd.publicKey, network).getAddress(network);
}

async function createTX(inputs, changeAddress) {
  const mtx = new MTX();
  const coins = [];
  let totalAmount = 0;

  for (const input of inputs) {
    const coin = input.getCoin();
    coins.push(coin);
    totalAmount += coin.value;
  }

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
