/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const {WebAuthn} = require('../../lib/hsd-ledger-browser');
const {Device} = WebAuthn;

describe('WebAuthn Device', function () {
  this.timeout(Number(process.env.DEVICE_TIMEOUT) || 40000);

  it('should list devices', async () => {
    const devices = await Device.getDevices();

    assert.ok(devices.length > 0, 'There should be at least one device.');
  });
});

require('./general')(Device);
