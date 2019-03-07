'use strict';

const Logger = require('blgr');
const {HID, LedgerHSD} = require('../lib/hsd-ledger');
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

  // Do not confirm on-device.
  const xpub = await ledger.getAccountXPUB(0);

  // Log to console for on-device confirmation.
  logger.info('XPUB: %s', xpub.xpubkey('regtest'));

  // Confirm on-device.
  await ledger.getAccountXPUB(0, { confirm: true });

  await device.close();

})().catch((e) => {
  console.error(e);
  process.exit(1);
});
