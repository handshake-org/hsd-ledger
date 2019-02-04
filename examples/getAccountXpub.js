'use strict';

const hnsledger = require('../lib/hns-ledger');
const {LedgerHSD} = hnsledger;
const {Device} = hnsledger.HID;

(async () => {
  const network = 'regtest';
  const confirm = false;
  const devices = await Device.getDevices();
  const device = new Device({
    device: devices[0],
    timeout: 60000
  });

  await device.open();

  const ledger = new LedgerHSD({ device, network });
  const xpub = await ledger.getAccountXpub(0, confirm);
  console.log('xpub:', xpub.xpubkey(network));
  await ledger.getAccountXpub(0, true);

  await device.close();

})().catch((e) => {
  console.error(e);
  process.exit(1);
});
