/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('../util/assert');
const {U2F} = require('../../lib/hns-ledger');
const {Device, DeviceInfo} = U2F;

const DEVICE_TIMEOUT = Number(process.env.DEVICE_TIMEOUT) || 15000;

describe('HID Device', function () {
  this.timeout(DEVICE_TIMEOUT);

  it('should list devices', async () => {
    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device');
  });
});

require('./general')(Device, DeviceInfo);
