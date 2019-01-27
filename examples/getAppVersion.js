'use strict';

const hnsledger = require('../lib/hns-ledger');
const {LedgerHSD} = hnsledger;
const {Device} = hnsledger.HID;

(async () => {
  const devices = await Device.getDevices();
  const device = new Device({
    device: devices[0],
    timeout: 5000
  });

  await device.open();

  const ledger = new LedgerHSD({ device })
  const version = await ledger.getAppVersion();
  console.log('version: ', version);

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
