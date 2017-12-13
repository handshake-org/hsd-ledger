'use strict';

const {Device} = require('../test/util/device');
const LedgerBcoin = require('../lib/bcoin');
const bench = require('./bench');

const tx = Buffer.from(
    '010000000244faa5b7034adc747a055f423326c67942ac980569c20834b39b709'
  + '9d22b797b000000006a473044022069a8603103073a5adb087cbb4a6feef2af719b9d7d6'
  + '7f3053ee761c910b33705022045ef3521ee78232f25e0f0d3ecc8e741fec055111daa7ba'
  + '907ae1c05b814712e012102cce90d5a8a0a37c2df09b5fea38d546b0ba58ce7099ea8127'
  + '721bea333da6a2affffffff0d1cb20bd1d309f64b0d6c29f1a1d13952ae2cd7645638735'
  + '6b03d6d9fc757c0000000006a47304402203c4f20248cf9798916ad0a1a94a9504393a88'
  + '8e29a10e9d940d9f98a06c7b08f022014599b05bf116acbd5ff2e3ad65ff179770722590'
  + 'f6f5b2472960ea6802e002e012102cce90d5a8a0a37c2df09b5fea38d546b0ba58ce7099'
  + 'ea8127721bea333da6a2affffffff02a0763577000000001976a9147116d0b9f272ee4b6'
  + 'aac688dd99f44bdb3e9539388ac005ed0b2000000001976a9143c9269ba6d1fbf7505d89'
  + '94ac71b93e7283f2e9188ac00000000', 'hex');

const responses = new Array(13).fill(Buffer.from('9000', 'hex'));
responses[12] = Buffer.from(
  '3200b32b1674edca60ce7863a3bbf04fdaad83aa9bbbd90d57f269134aca8bedae5355b60100'
  + '0000005ed0b200000000a726e3482a6e18909000', 'hex');

(async () => {
  const device = new Device({
    responses
  });

  const ledgerBcoin = new LedgerBcoin({
    device: device
  });

  const OPS = 10000;

  {
    const end = bench('getTrustedInput');

    for (let i = 0; i < OPS; i++) {
      await ledgerBcoin.getTrustedInput(tx, 1);
      device.resetResponses();
    }
    end(OPS);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
