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
  const result = await ledger.getAppVersion();
  console.log('result: ', result);

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
