'use strict';

const Logger = require('blgr');
const {Amount, Address, Coin, MTX, Script} = require('hsd');
const util = require('../test/utils/fund');
const {USB, LedgerHSD, LedgerInput} = require('../lib/hsd-ledger');
const {Device} = USB;

(async () => {
  // Create logger.
  const logger = new Logger({
    console: true,
    level: 'debug'
  });

  // Get first device available and
  // set optional properties.
  const device = await Device.requestDevice();
  device.set({
    timeout: 15000, // optional (default is 5000ms)
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

  const signers = [
    { acct: 0, path: 'm/44\'/5355\'/0\'/0/0' },
    { acct: 1, path: 'm/44\'/5355\'/1\'/0/0' },
    { acct: 2, path: 'm/44\'/5355\'/2\'/0/0' }
  ];

  logger.info('Constructing multisig address.');

  for (const signer of signers)
    signer.pub = await ledger.getPublicKey(signer.path);

  const [m, n] = [2, signers.length];
  const redeem = Script.fromMultisig(m, n, [
    signers[0].pub,
    signers[1].pub,
    signers[2].pub
  ]);
  const address = Address.fromScript(redeem);
  const changeAddress = Address.fromScript(redeem);

  logger.info('Constructing spend transaction.');

  const {coins, txs} = await util.fundAddress(address, 1);
  const mtx = new MTX();
  const value = Amount.fromCoins(1).toValue();

  mtx.addOutput({ address, value });

  await mtx.fund(coins, { changeAddress });

  const ledgerInputs = [];
  const coin = Coin.fromTX(txs[0], 0, -1);

  ledgerInputs.push(new LedgerInput({
    path: signers[0].path,
    coin,
    input: mtx.inputs[0],
    index: 0,
    publicKey: signers[0].pub,
    redeem,
    type: Script.hashType.ALL
  }));

  ledgerInputs.push(new LedgerInput({
    path: signers[1].path,
    coin,
    input: mtx.inputs[0],
    index: 0,
    publicKey: signers[1].pub,
    redeem,
    type: Script.hashType.ALL
  }));

  logger.info(`Confirm TXID: ${mtx.txid()}`);

  const part = await ledger.signTransaction(mtx, [ledgerInputs[0]]);

  logger.info(`Confirm TXID: ${mtx.txid()}`);

  const full = await ledger.signTransaction(part, [ledgerInputs[1]]);

  logger.info(`Result of TX.verify(): ${full.verify()}.`);

  await device.close();
  await logger.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
