'use strict';

const bledger = require('../lib/bledger');
const {LedgerBcoin} = bledger;
const {Device} = bledger.HID;
const {addressFlags} = LedgerBcoin;

const KeyRing = require('bcoin/lib/primitives/keyring');

(async () => {
  const devices = await Device.getDevices();

  const device = new Device({
    device: devices[0],
    timeout: 60000
  });

  await device.open();

  const purpose = 44;
  const coinType = 0;
  const account = 0;
  const receivePath = `m/${purpose}'/${coinType}'/${account}'/0/0`;

  const ledgerBcoin = new LedgerBcoin({ device });
  const hdpub = await ledgerBcoin.getPublicKey(receivePath);

  const ring = KeyRing.fromPublic(hdpub.publicKey);
  const addr = ring.getAddress();

  console.log('Verify legacy address is the same: ', addr.toString());
  const verifyLegacy = addressFlags.VERIFY | addressFlags.LEGACY;
  await ledgerBcoin.getPublicKey(receivePath, verifyLegacy);

  ring.refresh();
  ring.witness = true;
  ring.nested = true;

  const nestedAddr = ring.getAddress();
  const verifyNested = addressFlags.VERIFY | addressFlags.NESTED_WITNESS;
  console.log('Verify nested address is the same: ', nestedAddr.toString());
  console.log(await ledgerBcoin.getPublicKey(receivePath, verifyNested));

  ring.refresh();
  ring.witness = true;
  ring.nested = false;
  const bech32Addr = ring.getAddress();
  const verifyWitness = addressFlags.VERIFY | addressFlags.WITNESS;
  console.log('Verify bech32 address is the same: ', bech32Addr.toString());
  console.log(await ledgerBcoin.getPublicKey(receivePath, verifyWitness));

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
