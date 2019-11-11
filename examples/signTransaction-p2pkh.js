'use strict';

const Logger = require('blgr');
const {Coin, MTX, KeyRing, Output, Script} = require('hsd');
const rules = require('hsd/lib/covenants/rules');
const util = require('../test/utils/fund');
const {
  USB, LedgerHSD, LedgerInput, LedgerCovenant
} = require('../lib/hsd-ledger');
const {Device} = USB;

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
    timeout: 1000 * 60 * 5, // optional (default is 5000ms)
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

  // Creating a test transaction using testing utils.
  // '../test/e2e/' has examples using an `hsd` full node.
  const mtx = new MTX();
  const pubkey = await ledger.getPublicKey('m/44\'/5355\'/0\'/0/0');
  const ring = await KeyRing.fromPublic(pubkey);
  const addr = ring.getAddress();
  const {coins, txs} = await util.fundAddress(addr, 1);

  const output = new Output();
  output.address = KeyRing.generate().getAddress();
  output.value = 10000000;
  output.covenant.type = rules.types.NONE;

  mtx.addOutput(output);
  mtx.addOutput({
    address: KeyRing.generate().getAddress(),
    value: 10000000
  });

  await mtx.fund(coins, {
    changeAddress: ring.getAddress(),
    subtractFee: true
  });

  const ledgerInput = new LedgerInput({
    coin: Coin.fromTX(txs[0], 0, -1),
    input: mtx.inputs[0],
    index: 0,
    path: 'm/44\'/5355\'/0\'/0/0',
    publicKey: pubkey,
    type: Script.hashType.ALL
  });

  const ledgerCovenant = new LedgerCovenant({
    index: 0,
    name: 'boyma'
  });

  let fees = ledgerInput.coin.value;

  logger.info(`Confirm details for TXID: ${mtx.txid()}`);
  logger.info('');

  for (let i = 0; i < mtx.outputs.length; i++) {
    const output = mtx.outputs[i];
    fees -= output.value;
    logger.info(`Output #${i+1}`);
    logger.info(`Covenant: ${rules.typesByVal[output.covenant.type]}`);
    logger.info(`Value: ${output.value/1e6}`);
    logger.info(`Address: ${output.address.toString('regtest')}`);
    logger.info('');
  }

  logger.info(`Fees: ${fees/1e6}`);

  const signed = await ledger.signTransaction(mtx, {
    inputs: [ledgerInput],
    covenants: [ledgerCovenant]
  });

  logger.info(`Result of TX.verify(): ${signed.verify()}.`);

  // Close logger and device.
  await device.close();
  await logger.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
