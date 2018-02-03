'use strict';

const bledger = require('../lib/bledger');
const {LedgerBcoin, LedgerTXInput} = bledger;
const {Device} = bledger.HID;
const MTX = require('bcoin/lib/primitives/mtx');
const KeyRing = require('bcoin/lib/primitives/keyring');
const fundUtil = require('../test/util/fund');

const ring = KeyRing.generate();
ring.witness = true;

const randWitness = ring.getAddress();

(async () => {
  const devices = await Device.getDevices();

  const device = new Device({
    device: devices[0],
    timeout: 5000
  });

  await device.open();

  const bcoinApp = new LedgerBcoin({
    device: device
  });

  // Create witness address
  const path = 'm/44\'/0\'/1\'/0/0';
  const hdpub = await bcoinApp.getPublicKey(path);
  const ring = await KeyRing.fromPublic(hdpub.publicKey);
  ring.witness = true;
  const address = ring.getAddress();

  // Using our fundUtil we can mock a funding
  // transaction and use an output from that tx to
  // create our new transaction
  const {coins, txs} = await fundUtil.fundAddressFromWitness(address, 1);

  const mtx = new MTX();

  mtx.addOutput({
    address: randWitness,
    value: 10000000
  });

  await mtx.fund(coins, {
    changeAddress: ring.getAddress(),
    subtractFee: true
  });

  const ledgerInputs = [];

  for (const tx of txs) {
    const ledgerInput = new LedgerTXInput({
      witness: true,
      tx: tx,
      index: 0,
      path: path,
      publicKey: hdpub.publicKey
    });

    ledgerInputs.push(ledgerInput);
  }

  await bcoinApp.signTransaction(mtx, ledgerInputs);

  console.log(mtx.verify());

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
