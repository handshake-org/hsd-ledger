'use strict';

const Logger = require('blgr');
const { Amount, Address, Coin, MTX, Script } = require('hsd');

const util = require('../test/utils/fund');
const {HID, LedgerHSD, LedgerInput } = require('../lib/hns-ledger');
const {Device} = HID;

(async () => {
  const logger = new Logger({
    console: true,
    level: 'info'
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
    network: 'regtest'
  });

  const accts = [
    { path: 'm/44\'/5355\'/0\'/0/0' },
    { path: 'm/44\'/5355\'/1\'/0/0' },
    { path: 'm/44\'/5355\'/2\'/0/0' }
  ];

  for (const acct of accts) {
    const xpub = await ledger.getXpub(acct.path);
    acct.xpub = xpub;
    acct.pub = acct.xpub.publicKey;
  }

  logger.info(`Constructing multisig address...`);

  const [m, n] = [2, accts.length];
  const [pub1, pub2, pub3] = [accts[0].pub, accts[1].pub, accts[2].pub];
  const redeem = Script.fromMultisig(m, n, [pub1, pub2, pub3]);
  const address = Address.fromScript(redeem);
  const changeAddress = Address.fromScript(redeem);

  logger.info('Constructing spend transaction...');

  const {coins, txs} = await util.fundAddress(address, 1);
  const mtx = new MTX();
  const value = Amount.fromCoins(1).toValue();

  mtx.addOutput({ address, value });

  await mtx.fund(coins, { changeAddress });

  logger.info('Constructing LedgerInputs...');

  const ledgerInputs = [];
  const coin = Coin.fromTX(txs[0], 0, -1);

  ledgerInputs.push(new LedgerInput({
    path: accts[0].path,
    coin,
    redeem
  }));

  ledgerInputs.push(new LedgerInput({
    path: accts[1].path,
    coin,
    redeem
  }));

  logger.info(`TXID: ${mtx.txid()}`);

  const part = await ledger.signTransaction(mtx, [ledgerInputs[0]]);
  const full = await ledger.signTransaction(part, [ledgerInputs[1]]);

  logger.info(`Result of TX.verify(): ${full.verify()}.`);

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
