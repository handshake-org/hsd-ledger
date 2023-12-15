/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const Logger = require('blgr');
const assert = require('bsert');
const {Coin, KeyRing, MTX, Network, Output, Script} = require('hsd');

const {Resource} = require('hsd/lib/dns/resource');
const rules = require('hsd/lib/covenants/rules');
const util = require('../utils/fund');
const {
  HID, LedgerHSD, LedgerChange, LedgerCovenant, LedgerInput
} = require('../..');
const {Device} = HID;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const network = Network.get('regtest');

describe('Sighash types support', function() {
  this.timeout(60000);

  const name = rules.grindName(2, 0, network);
  const nameHash = rules.hashName(name);
  const covenants = [new LedgerCovenant({index: 0, name})];
  let device, ledger, ledgerInput, logger, mtx, output;

  before(async () => {
    // Create logger.
    logger = new Logger({
      console: true,
      level: LOG_LEVEL
    });

    // Get first device available and set optional properties.
    device = await Device.requestDevice();
    device.set({
      timeout: 1000 * 60 * 5, // optional (default is 5mins)
      logger: logger  // optional
    });

    // Create ledger client object.
    ledger = new LedgerHSD({
      device: device,
      network: 'regtest',
      logger: logger  // optional
    });

    // Open logger and device.
    await logger.open();
    await device.open();

    mtx = new MTX();
    const pubkey = await ledger.getPublicKey('m/44\'/5355\'/0\'/0/0');
    const ring = await KeyRing.fromPublic(pubkey);
    const addr = ring.getAddress();
    const {coins, txs} = await util.fundAddress(addr, 1);

    // Use 256b txt record to assert that SIGHASH_SINGLE
    // parsing code works over multiple APDU messages.
    const txt = [
      'ce6cfbd5f11a36d141d5afd14a9c8450887a47496f57a6deb74348298de2abe6',
      '88acd75bd26983566fa705b7d043f1557ec50a1e09001686afecce17eea6d4db',
      '4ae549736eff518cac613be4233b5f29aaf00d8f3f23001305ad0238902c922e',
      'e982a186b38af45d612e56262eace181985dab1e8170474327dcf6804d342a0b'
    ];

    const resource = Resource.fromJSON({
      records: [{type: 'TXT', txt: txt}]
    });

    {
      const output = new Output();
      output.address = KeyRing.generate().getAddress();
      output.value = 10000000;
      output.covenant.type = rules.types.UPDATE;
      output.covenant.pushHash(nameHash);
      output.covenant.pushU32(100); // arbitrary height
      output.covenant.push(resource.encode()); // name data
      mtx.addOutput(output);
    }

    await mtx.fund(coins, {
      changeAddress: ring.getAddress()
    });

    ledgerInput = new LedgerInput({
      coin: Coin.fromTX(txs[0], 0, -1),
      input: mtx.inputs[0],
      index: 0,
      path: 'm/44\'/5355\'/0\'/0/0',
      publicKey: pubkey
    });

    output = mtx.outputs[0];
  });

  after(async () => {
    await device.close();
    await logger.close();
  });

  it('should sign SIGHASH_NONE', async () => {
    logger.info(`Confirm details for TXID: ${mtx.txid()}`);
    logger.info('');
    logger.info('Output #1');
    logger.info(`Covenant: ${rules.typesByVal[output.covenant.type]}`);
    logger.info(`Name: ${name}`);
    logger.info(`Value: ${output.value/1e6}`);
    logger.info(`Address: ${output.address.toString('regtest')}`);
    logger.info('');
    logger.info('Sighash Type: NONE');

    ledgerInput.type = Script.hashType.NONE;

    const signed = await ledger.signTransaction(mtx, {
      inputs: [ledgerInput],
      covenants: covenants,
      change: new LedgerChange({
        path: 'm/44\'/5355\'/0\'/0/0',
        index: 1,
        version: 0
      })
    });

    assert(signed.verify());
  });

  it('should sign SIGHASH_SINGLE', async () => {
    logger.info(`Confirm details for TXID: ${mtx.txid()}`);
    logger.info('');
    logger.info('Output #1');
    logger.info(`Covenant: ${rules.typesByVal[output.covenant.type]}`);
    logger.info(`Name: ${name}`);
    logger.info(`Value: ${output.value/1e6}`);
    logger.info(`Address: ${output.address.toString('regtest')}`);
    logger.info('');
    logger.info('Sighash Type: SINGLE');

    ledgerInput.type = Script.hashType.SINGLE;

    const signed = await ledger.signTransaction(mtx, {
      inputs: [ledgerInput],
      covenants: covenants,
      change: new LedgerChange({
        path: 'm/44\'/5355\'/0\'/0/0',
        index: 1,
        version: 0
      })
    });

    assert(signed.verify());
  });

  it('should sign SIGHASH_SINGLEREVERSE', async () => {
    logger.info(`Confirm details for TXID: ${mtx.txid()}`);
    logger.info('');
    logger.info('Output #1');
    logger.info(`Covenant: ${rules.typesByVal[output.covenant.type]}`);
    logger.info(`Name: ${name}`);
    logger.info(`Value: ${output.value/1e6}`);
    logger.info(`Address: ${output.address.toString('regtest')}`);
    logger.info('');
    logger.info('Sighash Type: SINGLEREVERSE');

    ledgerInput.type = Script.hashType.SINGLEREVERSE;

    const signed = await ledger.signTransaction(mtx, {
      inputs: [ledgerInput],
      covenants: covenants,
      change: new LedgerChange({
        path: 'm/44\'/5355\'/0\'/0/0',
        index: 1,
        version: 0
      })
    });

    assert(signed.verify());
  });

  it('should sign SIGHASH_NOINPUT', async () => {
    logger.info(`Confirm details for TXID: ${mtx.txid()}`);
    logger.info('');
    logger.info('Output #1');
    logger.info(`Covenant: ${rules.typesByVal[output.covenant.type]}`);
    logger.info(`Name: ${name}`);
    logger.info(`Value: ${output.value/1e6}`);
    logger.info(`Address: ${output.address.toString('regtest')}`);
    logger.info('');
    logger.info('Sighash Type: ALL | NOINPUT');

    ledgerInput.type = Script.hashType.ALL | Script.hashType.NOINPUT;

    const signed = await ledger.signTransaction(mtx, {
      inputs: [ledgerInput],
      covenants: covenants,
      change: new LedgerChange({
        path: 'm/44\'/5355\'/0\'/0/0',
        index: 1,
        version: 0
      })
    });

    assert(signed.verify());
  });

  it('should sign SIGHASH_ANYONECANPAY', async () => {
    logger.info(`Confirm details for TXID: ${mtx.txid()}`);
    logger.info('');
    logger.info('Output #1');
    logger.info(`Covenant: ${rules.typesByVal[output.covenant.type]}`);
    logger.info(`Name: ${name}`);
    logger.info(`Value: ${output.value/1e6}`);
    logger.info(`Address: ${output.address.toString('regtest')}`);
    logger.info('');
    logger.info('Sighash Type: ALL | ANYONECANPAY');

    ledgerInput.type = Script.hashType.ALL | Script.hashType.ANYONECANPAY;

    const signed = await ledger.signTransaction(mtx, {
      inputs: [ledgerInput],
      covenants: covenants,
      change: new LedgerChange({
        path: 'm/44\'/5355\'/0\'/0/0',
        index: 1,
        version: 0
      })
    });

    assert(signed.verify());
  });
});
