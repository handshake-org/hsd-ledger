'use strict';

const KeyRing = require('hsd/lib/primitives/keyring');
const Logger = require('blgr');
const {HID, LedgerHSD} = require('../lib/hns-ledger');
const {Device} = HID;

(async () => {
  const logger = new Logger({
    console: true,
    level: 'debug'
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
    network: 'regtest',
    logger: logger // optional
  });

  logger.info('Device should only show warning twice.');

  // NOTE: should be able to retrieve purpose xpub without WARNING.
  const purpose = await ledger.getXPUB(`m/44'`);

  // NOTE: unsafe unhardened derivation will cause confirmation.
  const unsafe = await ledger.getXPUB(`m/44'/5353/0'`);

  // NOTE: longer than usual derivation path will cause confirmation.
  const long = await ledger.getXPUB(`m/44'/5353'/0'/0/0/0`);

  await device.close();

})().catch((e) => {
  console.error(e);
  process.exit(1);
});
