/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const {HID} = require('../../lib/hsd-ledger');
const {Device, DeviceInfo} = HID;

describe('HID Device', function () {
  this.timeout(Number(process.env.DEVICE_TIMEOUT) || 40000);

  it('should list devices', async () => {
    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device.');

    for (const device of devices)
      assert.ok(DeviceInfo.isLedgerDevice(device),
        'Device should be a ledger device.');
  });
});

require('./general')(Device, DeviceInfo);
