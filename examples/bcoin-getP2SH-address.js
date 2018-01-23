'use strict';

const {Script} = require('bcoin/lib/script');

const bledger = require('../lib/bledger');
const {LedgerBcoin} = bledger;
const {Device} = bledger.hid;

const NETWORK = 'regtest';

(async () => {
  const devices = await Device.getDevices();

  const device = new Device({
    device: devices[0],
    timeout: 5000
  });

  await device.open();

  const path = 'm/44\'/0\'/0\'';
  const path1 = `${path}/1/1`;
  const path2 = `${path}/2/1`;

  const bcoinApp = new LedgerBcoin({ device });

  const hdpub1 = await bcoinApp.getPublicKey(path1);
  const hdpub2 = await bcoinApp.getPublicKey(path2);

  const [pk1, pk2] = [hdpub1.publicKey, hdpub2.publicKey];
  const [m, n] = [2, 2];

  const multisigScript = Script.fromMultisig(m, n, [pk1, pk2]);

  const addr = multisigScript.getAddress().toBase58(NETWORK);

  console.log(addr);

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
