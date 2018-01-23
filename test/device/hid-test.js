/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('../util/assert');
const bledger = require('../../lib/bledger');

const {Device, DeviceInfo} = bledger.hid;

const DEVICE_TIMEOUT = Number(process.env.DEVICE_TIMEOUT) || 15000;
describe('HID Device', function () {
  this.timeout(DEVICE_TIMEOUT);

  it('should list devices', async () => {
    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device');

    for (const device of devices)
      assert.ok(DeviceInfo.isLedgerDevice(device),
        'Device should be a ledger device');
  });
});

require('./general')(Device, DeviceInfo);
