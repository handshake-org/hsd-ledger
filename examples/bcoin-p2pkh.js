'use strict';

const bledger = require('../lib/bledger');
const {LedgerBcoin, LedgerTXInput} = bledger;
const {Device} = bledger.HID;
const MTX = require('bcoin/lib/primitives/mtx');
const Amount = require('bcoin/lib/btc/amount');
const KeyRing = require('bcoin/lib/primitives/keyring');
const Logger = require('blgr');

const fundUtil = require('../test/util/fund');

(async () => {
  const devices = await Device.getDevices();

  const logger = new Logger({
    console: true,
    level: 'info'
  });

  await logger.open();

  const device = new Device({
    device: devices[0],
    timeout: 20000,
    logger
  });

  await device.open();

  /**
   * We receive 2 transactions per path
   * combine all of them and send to one address,
   * with little change left
   */

  const ledgerBcoin = new LedgerBcoin({ device });

  const account = 'm/44/0\'/0\'';
  const accinfo = [
    { path: `${account}/0/0` },
    { path: `${account}/1/0` },
    { path: `${account}/1/1` }
  ];

  // we need address to send tx to ourselves.
  for (const info of accinfo) {
    const hd = await ledgerBcoin.getPublicKey(info.path);
    const ring = KeyRing.fromPublic(hd.publicKey);
    info.address = ring.getAddress('base58');

    // fund with 2 transactions
    const {coins, txs} = await fundUtil.fundAddress(info.address, 2);
    info.coins = coins;
    info.txs = txs;
  }

  const coins = accinfo.reduce((coins, info) => coins.concat(info.coins), []);
  const spendAmount = coins.length - 1;

  const mtx = new MTX();

  mtx.addOutput({
    address: '3Bi9H1hzCHWJoFEjc4xzVzEMywi35dyvsV',
    value: Amount.fromBTC(spendAmount).toValue()
  });

  await mtx.fund(coins, { changeAddress: accinfo[0].address });

  let ledgerInputs = [];

  for (const info of accinfo) {
    ledgerInputs = ledgerInputs.concat(info.txs.map((tx, i) => {
      return new LedgerTXInput({
        tx: tx,
        index: info.coins[i].index,
        path: info.path
      });
    }));
  }

  await ledgerBcoin.signTransaction(mtx, ledgerInputs);

  console.log(mtx.toRaw().toString('hex'));

  console.log(`Valid Transaction: ${mtx.verify()}.`);

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
