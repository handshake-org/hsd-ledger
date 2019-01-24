'use strict';

const KeyRing = require('hsd/lib/primitives/keyring');

const hnsledger = require('../lib/hns-ledger');
const {LedgerHSD} = hnsledger;
const {Device} = hnsledger.HID;

(async () => {
  const devices = await Device.getDevices();
  const device = new Device({
    device: devices[0],
    timeout: 60000
  });

  await device.open();

  const ledger = new LedgerHSD({ device, network: 'regtest' });
  const confirm = LedgerHSD.params.NO_CONFIRM;
  const result = await ledger.getAccountXpub(0, confirm);
  console.log('result:', result);

  await device.close();

})().catch((e) => {
  console.error(e);
  process.exit(1);
});
