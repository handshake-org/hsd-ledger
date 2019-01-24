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

  const path = `m/44'/5355'/0'/0/0`;
  const ledger = new LedgerHSD({ device, network: 'regtest' });
  const confirm = LedgerHSD.params.NO_CONFIRM;
  const result = await ledger.getPublicKey(path, confirm);
  console.log('result:', result);

  await device.close();

})().catch((e) => {
  console.error(e);
  process.exit(1);
});
