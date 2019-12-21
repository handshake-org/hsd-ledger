'use strict';

const Logger = require('blgr');
const {USB, LedgerHSD} = require('../lib/hsd-ledger');
const {Device} = USB;

(async () => {
  // Create logger.
  const logger = new Logger({
    console: true,
    level: 'info'
  });

  // Get first device available and
  // set optional properties.
  const device = await Device.requestDevice();
  device.set({
    timeout: 15000, // optional (default is 5000ms)
    logger: logger  // optional
  });

  // Create ledger client object.
  const ledger = new LedgerHSD({
    device: device,
    network: 'regtest',
    logger: logger // optional
  });

  // Open logger and device.
  await logger.open();
  await device.open();

  logger.info('Device should only show warning twice.');

  // NOTE: should be able to retrieve purpose xpub without WARNING.
  await ledger.getXPUB('m/44\'');

  // NOTE: unsafe unhardened derivation will cause confirmation.
  await ledger.getXPUB('m/44\'/5353/0\'');

  // NOTE: longer than usual derivation path will cause confirmation.
  await ledger.getXPUB('m/44\'/5353\'/0\'/0/0/0');

  // Close logger and device.
  await device.close();
  await logger.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
