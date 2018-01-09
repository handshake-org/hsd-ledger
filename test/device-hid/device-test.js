/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('../util/assert');
const bledger = require('../../lib/bledger');

const {Device, DeviceInfo} = bledger.hid;
const {LedgerBcoin} = bledger;

const DEVICE_TIMEOUT = Number(process.env.DEVICE_TIMEOUT) || 15000;

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
});
