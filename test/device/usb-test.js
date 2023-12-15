/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const {HID} = require('../../lib/hsd-ledger');
const {Device} = HID;

describe('HID Device (node)', function () {
  this.timeout(Number(process.env.DEVICE_TIMEOUT) || 40000);

  it('should list devices', async () => {
    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device.');

    // Because HID are opened automatically by getDevices(),
    // we must now close them to proceed with other tests.
    for (const d of devices)
      await d.close();
  });
});

require('./general')(Device);
