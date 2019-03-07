'use strict';

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

  // Do not confirm on-device.
  const pubkey = await ledger.getPublicKey(`m/44'/5355'/0'/0/0`);

  // Log to console for on-device confirmation.
  logger.info('Public Key:', pubkey.toString('hex'));

  // Confirm on-device.
  await await ledger.getPublicKey(`m/44'/5355'/0'/0/0`, { confirm: true });

  await device.close();

})().catch((e) => {
  console.error(e);
  process.exit(1);
});
