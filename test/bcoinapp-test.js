
/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('./util/assert');
const utils = require('./util/utils');

const {Device} = require('./util/device');
const LedgerBTC = require('../lib/ledger');
const LedgerBcoin = require('../lib/bcoin');
const LedgerTXInput = require('../lib/txinput');

const TX = require('bcoin/lib/primitives/tx');
const MTX = require('bcoin/lib/primitives/mtx');
const KeyRing = require('bcoin/lib/primitives/keyring');
const {Script} = require('bcoin/lib/script');
const hashType = Script.hashType;

const getRing = utils.getCommands('data/getRing.json');
const getTrustedInput = utils.getCommands('data/getTrustedInput.json');
const hashTxStart = utils.getCommands('data/hashTransactionStart.json');
const hashOutputFinalize = utils.getCommands('data/hashOutputFinalize.json');
const hashSign = utils.getCommands('data/hashSign.json');

const tx1 = utils.getCommands('data/tx1.json');
const tx2 = utils.getCommands('data/tx2.json');
const multisigTX1 = utils.getCommands('data/tx-p2sh-mulsig.json');
const wtx1 = utils.getCommands('data/wtx1.json');
const multisigWTX1 = utils.getCommands('data/tx-p2wsh-mulsig.json');

describe('Bitcoin App', function () {
  let device, bcoinApp, btcApp;

  beforeEach(() => {
    device = new Device();
    bcoinApp = new LedgerBcoin({ device });
    btcApp = new LedgerBTC(device);
  });

  it('should get ring from pubkey', async () => {
    const {data, responses, commands} = getRing;

    device.set({ responses });

    bcoinApp.set({
      network: 'testnet'
    });

    const path = data.path;
    const hd = await bcoinApp.getPublicKey(path);
    const ring = KeyRing.fromPublic(hd.publicKey);

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
  });

  it('should handle getTrustedInput commands', async () => {
    const {tx, responses, commands} = getTrustedInput;

    device.set({ responses });

    const response = await btcApp.getTrustedInput(TX.fromRaw(tx), 1);
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

  it('should handle hashTransactionStart non-segwit commands', async () => {
    const {data, tx, responses, commands} = hashTxStart;

    device.set({ responses });

    const tis = {};

    for (const tik of Object.keys(data.trusted)) {
      tis[tik] = Buffer.from(data.trusted[tik], 'hex');
    }

    const mtx = MTX.fromRaw(tx);
    const pokey = data.prevoutKey;
    const prev = Script.fromRaw(data.prev, 'hex');

    await btcApp.hashTransactionStartNullify(mtx, pokey, prev, tis, true);

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

    const validations = await btcApp.hashOutputFinalize(TX.fromRaw(tx));
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

    const signature = await btcApp.hashSign(TX.fromRaw(tx), path, sigType);

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

  for (const [i, txData] of [tx1, tx2].entries()) {
    it(`should sign normal P2PKH transaction ${i}`, async () => {
      const { data, tx, commands, responses } = txData;

      device.set({ responses });

      const ledgerInputs = wrapTXInputs(data.ledgerInputs);

      const mtx = MTX.fromRaw(tx, 'hex');
      await bcoinApp.signTransaction(mtx, ledgerInputs);

      const deviceCommands = device.getCommands();

      for (const [i, deviceCommand] of deviceCommands.entries()) {
        assert.bufferEqual(deviceCommand, commands[i],
          `Message ${i} wasn't correct`
        );
      }

      assert.strictEqual(deviceCommands.length, commands.length,
        'Number of messages doesn\'t match'
      );

      assert.bufferEqual(mtx.toRaw(), Buffer.from(data.signedTX, 'hex'),
        'Transaction was not signed properly'
      );
    });
  }

  for (const [i, txData] of [multisigTX1].entries()) {
    it(`should sign P2SH/Multisig transaction ${i}`, async () => {
      const {data, tx, commands, responses } = txData;

      device.set({ responses });

      const ledgerInputs = wrapTXInputs(data.ledgerInputs);

      const mtx = MTX.fromRaw(tx, 'hex');
      await bcoinApp.signTransaction(mtx, ledgerInputs);

      const deviceCommands = device.getCommands();

      for (const [i, deviceCommand] of deviceCommands.entries()) {
        assert.bufferEqual(deviceCommand, commands[i],
          `Message ${i} wasn't correct`
        );
      }

      assert.strictEqual(deviceCommands.length, commands.length,
        'Number of messages doesn\'t match'
      );

      assert.bufferEqual(mtx.toRaw(), Buffer.from(data.signedTX, 'hex'),
        'Transaction was not signed properly'
      );
    });
  }

  it('should sign P2WPKH transaction', async () => {
    const {data, tx, commands, responses} = wtx1;

    device.set({ responses });

    const ledgerInputs = wrapTXInputs(data.ledgerInputs);
    const mtx = MTX.fromRaw(tx, 'hex');

    updateCoinView(mtx, ledgerInputs);

    await bcoinApp.signTransaction(mtx, ledgerInputs);

    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    assert.bufferEqual(mtx.toRaw(), Buffer.from(data.signedTX, 'hex'),
      'Transaction was not signed properly'
    );
  });

  it('should sign P2WSH transaction', async () => {
    const {data, tx, commands, responses } = multisigWTX1;

    device.set({ responses });

    const ledgerInputs = wrapTXInputs(data.ledgerInputs);
    const mtx = MTX.fromRaw(tx, 'hex');

    updateCoinView(mtx, ledgerInputs);

    await bcoinApp.signTransaction(mtx, ledgerInputs);

    const deviceCommands = device.getCommands();

    for (const [i, deviceCommand] of deviceCommands.entries()) {
      assert.bufferEqual(deviceCommand, commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(deviceCommands.length, commands.length,
      'Number of messages doesn\'t match'
    );

    assert.bufferEqual(mtx.toRaw(), Buffer.from(data.signedTX, 'hex'),
      'Transaction was not signed properly'
    );
  });
});

function wrapTXInputs(inputData) {
  const ledgerInputs = [];

  for (const ledgerInput of inputData) {
    ledgerInputs.push(new LedgerTXInput({
      tx: Buffer.from(ledgerInput.tx, 'hex'),
      index: ledgerInput.index,
      path: ledgerInput.path,
      redeem: ledgerInput.redeem != null
        ? Script.fromRaw(ledgerInput.redeem, 'hex')
        : null,
      witness: ledgerInput.witness
    }));
  }

  return ledgerInputs;
}

function updateCoinView(tx, ledgerInputs) {
  for (const input of ledgerInputs) {
    tx.view.addOutput(input.getOutpoint(), input.getCoin());
  }
}
