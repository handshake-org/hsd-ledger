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

  const ledger = new LedgerHSD({
    device: device,
    network: 'regtest',
    logger: logger // optional
  });

  logger.info('Device should only show warning twice.');

  // NOTE: should be able to retrieve purpose xpub without WARNING.
  await ledger.getXPUB('m/44\'');

  // NOTE: unsafe unhardened derivation will cause confirmation.
  await ledger.getXPUB('m/44\'/5353/0\'');

  // NOTE: longer than usual derivation path will cause confirmation.
  await ledger.getXPUB('m/44\'/5353\'/0\'/0/0/0');

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
