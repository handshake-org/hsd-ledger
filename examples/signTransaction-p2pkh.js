'use strict';

const Coin = require('hsd/lib/primitives/coin');
const MTX = require('hsd/lib/primitives/mtx');
const KeyRing = require('hsd/lib/primitives/keyring');
const Script = require('hsd/lib/script/script');
const {hashType} = Script;

const util = require('../test/util/fund');
const hnsledger = require('../lib/hns-ledger');
const {LedgerHSD, LedgerInput} = hnsledger;
const {Device} = hnsledger.HID;

(async () => {
  const devices = await Device.getDevices();
  const device = new Device({
    device: devices[0],
    timeout: 60000
  });

  await device.open();

  const ledger = new LedgerHSD({ device, network: 'regtest' });
  const pub = await ledger.getPublicKey(0, 0, 0, false);
  const ring = await KeyRing.fromPublic(pub);
  const addr = ring.getAddress();
  const {coins, txs} = await util.fundAddress(addr, 1);

  const mtx = new MTX();

  mtx.addOutput({
    address: KeyRing.generate().getAddress(),
    value: 10000000
  });

  await mtx.fund(coins, {
    changeAddress: ring.getAddress(),
    subtractFee: true
  });

  const ledgerInput = new LedgerInput({
    path: `m/44'/5355'/0'/0/0`,
    coin: Coin.fromTX(txs[0], 0, -1)
  });

  console.log(`txid: ${mtx.txid()}`);

  const signed = await ledger.signTransaction(mtx, [ledgerInput]);

  console.log(`valid tx: ${signed.verify()}.`);

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
