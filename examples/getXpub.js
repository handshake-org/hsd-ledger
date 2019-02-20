'use strict';

const KeyRing = require('hsd/lib/primitives/keyring');
const Logger = require('blgr');
const {HID, LedgerHSD} = require('../lib/hns-ledger');
const {Device} = HID;

(async () => {
  const logger = new Logger({
    console: true,
    level: 'info'
  });

  await logger.open();

  const devices = await Device.getDevices();

  const device = new Device({
    device: devices[0],
    timeout: 15000, // optional (default is 5000ms)
    logger: logger  // optional
  });

  await device.open();

  const ledger = new LedgerHSD({
    device: device,
    network: 'regtest'
  });

  // NOTE: unsafe unhardened derivation will cause confirmation.
  const unsafe = await ledger.getXpub(`m/44'/5353/0'`, false);

  // NOTE: longer than usual derivation path will cause confirmation.
  const long = await ledger.getXpub(`m/44'/5353'/0'/0/0/0`, false);

  await device.close();

})().catch((e) => {
  console.error(e);
  process.exit(1);
});
