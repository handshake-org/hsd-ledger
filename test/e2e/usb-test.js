/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const {USB} = require('../../lib/hsd-ledger');
const {Device} = USB;

describe('USB Device (node)', function () {
  this.timeout(Number(process.env.DEVICE_TIMEOUT) || 40000);

  it('should list devices', async () => {
    // Request/list devices.
    // NOTE: on node.js it will enable all devices that exist.
    await Device.requestDevice();

    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device.');

    for (const device of devices)
      assert.ok(Device.isLedgerDevice(device),
        'Device should be a ledger device.');
  });
});

require('./general')(Device);
