'use strict';

const MTX = require('bcoin/lib/primitives/mtx');
const Amount = require('bcoin/lib/btc/amount');
const {Script} = require('bcoin/lib/script');

const bledger = require('../lib/bledger');
const {LedgerBcoin, LedgerTXInput} = bledger;
const {Device} = bledger.hid;

const fundUtil = require('../test/util/fund');

(async () => {
  const devices = await Device.getDevices();

  const device = new Device({
    device: devices[0],
    timeout: 5000
  });

  await device.open();

  const accounts = [
    { path: 'm/44\'/0\'/0\'/0/0' },
    { path: 'm/44\'/0\'/1\'/0/0' }
  ];

  const bcoinApp = new LedgerBcoin({ device });

  for (const acc of accounts) {
    acc.hd = await bcoinApp.getPublicKey(acc.path);
    acc.pk = acc.hd.publicKey;
  }

  const [m, n] = [2, accounts.length];
  const [pk1, pk2] = [accounts[0].pk, accounts[1].pk];

  const multisigScript = Script.fromMultisig(m, n, [pk1, pk2]);
  const addr = multisigScript.getAddress().toBase58();

  console.log(`Funding Address: ${addr}\n`);
  const {coins, txs} = await fundUtil.fundAddress(addr, 2);

  console.log('Constructing spend transaction');
  const mtx = new MTX();

  mtx.addOutput({
    address: '3Bi9H1hzCHWJoFEjc4xzVzEMywi35dyvsV',
    value: Amount.fromBTC(1).toValue()
  });

  await mtx.fund(coins, {
    changeAddress: addr
  });

  console.log('Create LedgerInputs for each input and each signer');
  const ledgerInputs = [];

  for (const acc of accounts) {
    for (const tx of txs) {
      const ledgerInput = new LedgerTXInput({
        tx: tx,
        index: 0,
        redeem: multisigScript,
        path: acc.path,
        publicKey: acc.pk
      });

      ledgerInputs.push(ledgerInput);
    }
  }

  await bcoinApp.signTransaction(mtx, ledgerInputs);

  console.log(mtx);
  console.log(mtx.verify());

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

