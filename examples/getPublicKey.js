'use strict';

const Logger = require('blgr');
const {HID, LedgerHSD} = require('../lib/hsd-ledger');
const {Device} = HID;

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
    timeout: 15000, // optional (default is 5mins)
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
  const pubkey = await ledger.getPublicKey('m/44\'/5355\'/0\'/0/0');

  // Log to console for on-device confirmation.
  logger.info('Public Key:', pubkey.toString('hex'));

  // Confirm on-device.
  await ledger.getPublicKey('m/44\'/5355\'/0\'/0/0', { confirm: true });

  // Close logger and device.
  await device.close();
  await logger.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
