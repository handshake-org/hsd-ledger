'use strict';

const Logger = require('blgr');
const {USB, LedgerHSD} = require('../lib/hsd-ledger');
const {Device} = USB;

(async () => {
  const logger = new Logger({
    console: true,
    level: 'debug'
  });

  await logger.open();

  // Get first device available.
  const device = await Device.requestDevice();

  device.set({
    timeout: 15000, // optional (default is 5000ms)
    logger: logger  // optional
  });

  await device.open();

  // Note: network defaults to 'main'
  const ledger = new LedgerHSD({ device, logger }); // logger optional
  const version = await ledger.getAppVersion();
  logger.info('Version: %s', version);

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
