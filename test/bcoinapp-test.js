
/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('./util/assert');
const utils = require('./util/utils');
const {Device} = require('./util/device');
const {LedgerBcoin, SignInput} = require('../lib/bcoin');
const {hashType} = require('../lib/utils/util');
const {Script} = require('bcoin/lib/script');

const getRing = utils.getCommands('data/getRing.json');
const getTrustedInput = utils.getCommands('data/getTrustedInput.json');
const hashTxStart = utils.getCommands('data/hashTransactionStart.json');
const hashOutputFinalize = utils.getCommands('data/hashOutputFinalize.json');
const hashSign = utils.getCommands('data/hashSign.json');

const tx1 = utils.getCommands('data/tx1.json');

describe('Bitcoin App', function () {
  let device, bcoinApp;

  beforeEach(() => {
    device = new Device();
    bcoinApp = new LedgerBcoin({ device });
  });

  it('should get ring from pubkey', async () => {
    const {data, responses, commands} = getRing;

    device.set({ responses });

    bcoinApp.set({
      network: 'testnet'
    });

    const path = data.path;
    const hd = await bcoinApp.getPublicKey(path);
    const ring = bcoinApp.ringFromHD(hd);

    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    // ring checks
    assert.strictEqual(ring.getPublicKey('hex'), data.pubkey);
    assert.strictEqual(ring.network.toString(), 'testnet');
  });

  it('should handle getTrustedInput commands', async () => {
    const {tx, responses, commands} = getTrustedInput;

    device.set({ responses });

    const response = await bcoinApp.getTrustedInput(tx, 1);
    const deviceCommands = device.getCommands();

    assert.bufferEqual(response, responses[12].slice(0, -2));

    for (let i = 0; i < deviceCommands.length; i++) {
      assert.bufferEqual(deviceCommands[i], commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );
  });

  it('should handle hashTransactionStart commands', async () => {
    const {data, tx, responses, commands} = hashTxStart;

    device.set({ responses });

    const tis = {};

    for (const tik of Object.keys(data.trusted)) {
      tis[tik] = Buffer.from(data.trusted[tik], 'hex');
    }

    const pokey = data.prevoutKey;
    const prev = Script.fromRaw(data.prev, 'hex');

    await bcoinApp.hashTransactionStart(tx, pokey, prev, tis, true);

    const deviceCommands = device.getCommands();

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    for (let i = 0; i < deviceCommands.length; i++) {
      assert.bufferEqual(deviceCommands[i], commands[i],
        `Message ${i} wasn't correct`
      );
    }
  });

  it('should handle hashOutputFinalize', async () => {
    const {tx, responses, commands} = hashOutputFinalize;

    device.set({ responses });

    const validations = await bcoinApp.hashOutputFinalize(tx);
    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    assert.strictEqual(validations.length, 2,
      'There should be 2 user validation requests'
    );

    for (const validation of validations) {
      assert.strictEqual(validation, false,
        'All valdiation requests are false'
      );
    }
  });

  it('should handle hashSign', async () => {
    const {
      tx,
      responses,
      commands,
      data
    } = hashSign;

    device.set({ responses });

    const path = 'm/44\'/0\'/0\'/0/0';
    const sigType = hashType.ALL;

    const signature = await bcoinApp.hashSign(tx, path, sigType);

    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    assert.bufferEqual(signature, Buffer.from(data.signature, 'hex'),
      'Signature wasn\'t correct'
    );
  });

  it('should sign transaction', async () => {
    const { data, tx, commands, responses } = tx1;

    device.set({ responses });

    const signInputs = [];

    for (const si of data.signInputs) {
      signInputs.push(new SignInput({
        tx: Buffer.from(si.tx, 'hex'),
        index: si.index,
        path: si.path
      }));
    }

    const signTx = Buffer.from(tx, 'hex');
    const signedTx = await bcoinApp.signTransaction(signTx, signInputs);

    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    assert.bufferEqual(signedTx.toRaw(), Buffer.from(data.signedTX, 'hex'),
      'Transaction was not signed properly'
    );
  });
});
