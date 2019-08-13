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

  // Do not confirm on-device.
  const pubkey = await ledger.getPublicKey('m/44\'/5355\'/0\'/0/0');

  // Log to console for on-device confirmation.
  logger.info('Public Key:', pubkey.toString('hex'));

  // Confirm on-device.
  await ledger.getPublicKey('m/44\'/5355\'/0\'/0/0', { confirm: true });

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
