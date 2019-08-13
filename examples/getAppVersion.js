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
  // Note: network defaults to 'main'
  const ledger = new LedgerHSD({ device, logger }); // logger optional

  // Open logger and device.
  await logger.open();
  await device.open();

  // Retrieve app version.
  const version = await ledger.getAppVersion();
  logger.info('Version: %s', version);

  // Close logger and device.
  await device.close();
  await logger.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
