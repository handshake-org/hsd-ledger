'use strict';

const Logger = require('blgr');
const {USB, LedgerHSD} = require('../lib/hsd-ledger');
const {Device} = USB;

(async () => {
  // Create logger.
  const logger = new Logger({
    console: true,
    level: 'debug'
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

  // Do not confirm on-device.
  const address = await ledger.getAddress(0, 0, 0);

  // Log to console for on-device confirmation.
  logger.info('Address: %s', address);

  // Confirm on-device.
  await ledger.getAddress(0, 0, 0, { confirm: true });

  // Close logger and device.
  await device.close();
  await logger.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
