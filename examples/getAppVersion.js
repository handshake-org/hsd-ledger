'use strict';

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
    timeout: 5000, // optional (default is 5000ms)
    logger: logger // optional
  });

  await device.open();

  // Note: network defaults to 'main'
  const ledger = new LedgerHSD({ device })
  const version = await ledger.getAppVersion();
  logger.info('Version: %s', version);

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
