/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('../utils/assert');
const {HID} = require('../../lib/hns-ledger');
const {Device, DeviceInfo} = HID;

const DEVICE_TIMEOUT = Number(process.env.DEVICE_TIMEOUT) || 15000;

describe('HID', function () {
  this.timeout(DEVICE_TIMEOUT);

  it('should list devices', async () => {
    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device');

    for (const device of devices)
      assert.ok(DeviceInfo.isLedgerDevice(device),
        'Device should be a Ledger device');
  });
});

require('./general')(Device, DeviceInfo);
