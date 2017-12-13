
/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('./util/assert');
const {Device} = require('./util/device');
const LedgerBcoin = require('../lib/bcoin');

const tx = Buffer.from(
  '010000000244faa5b7034adc747a055f423326c67942ac980569c20834b39b7099'
  + 'd22b797b000000006a473044022069a8603103073a5adb087cbb4a6feef2af719b9d7d67f'
  + '3053ee761c910b33705022045ef3521ee78232f25e0f0d3ecc8e741fec055111daa7ba907'
  + 'ae1c05b814712e012102cce90d5a8a0a37c2df09b5fea38d546b0ba58ce7099ea8127721b'
  + 'ea333da6a2affffffff0d1cb20bd1d309f64b0d6c29f1a1d13952ae2cd76456387356b03d'
  + '6d9fc757c0000000006a47304402203c4f20248cf9798916ad0a1a94a9504393a888e29a1'
  + '0e9d940d9f98a06c7b08f022014599b05bf116acbd5ff2e3ad65ff179770722590f6f5b24'
  + '72960ea6802e002e012102cce90d5a8a0a37c2df09b5fea38d546b0ba58ce7099ea812772'
  + '1bea333da6a2affffffff02a0763577000000001976a9147116d0b9f272ee4b6aac688dd9'
  + '9f44bdb3e9539388ac005ed0b2000000001976a9143c9269ba6d1fbf7505d8994ac71b93e'
  + '7283f2e9188ac00000000', 'hex');

/*
 * Get Trusted Input
 */
const getTrustedInputCommands = [
  'e042000009000000010100000002',
  'e04280002544faa5b7034adc747a055f423326c67942ac980569c20834b39b7099d22b797b00'
    + '0000006a',
  'e042800032473044022069a8603103073a5adb087cbb4a6feef2af719b9d7d67f3053ee761c9'
    + '10b33705022045ef3521ee78232f25e0f0',
  'e042800032d3ecc8e741fec055111daa7ba907ae1c05b814712e012102cce90d5a8a0a37c2df'
    + '09b5fea38d546b0ba58ce7099ea8127721',
  'e04280000abea333da6a2affffffff',
  'e0428000250d1cb20bd1d309f64b0d6c29f1a1d13952ae2cd76456387356b03d6d9fc757c000'
    + '0000006a',
  'e04280003247304402203c4f20248cf9798916ad0a1a94a9504393a888e29a10e9d940d9f98a'
    + '06c7b08f022014599b05bf116acbd5ff2e',
  'e0428000323ad65ff179770722590f6f5b2472960ea6802e002e012102cce90d5a8a0a37c2df'
    + '09b5fea38d546b0ba58ce7099ea8127721',
  'e04280000abea333da6a2affffffff',
  'e04280000102',
  'e042800022a0763577000000001976a9147116d0b9f272ee4b6aac688dd99f44bdb3e9539388'
    + 'ac',
  'e042800022005ed0b2000000001976a9143c9269ba6d1fbf7505d8994ac71b93e7283f2e9188'
    + 'ac',
  'e04280000400000000'
].map(test => Buffer.from(test, 'hex'));

const getTrustedInputResponses = new Array(13).fill(Buffer.from('9000', 'hex'));
getTrustedInputResponses[12] = Buffer.from(
  '3200b32b1674edca60ce7863a3bbf04fdaad83aa9bbbd90d57f269134aca8bedae5355b60100'
  + '0000005ed0b200000000a726e3482a6e18909000', 'hex');

describe('Bitcoin App', function () {
  it('should split transaction to commands', async () => {
    const device = new Device({
      responses: getTrustedInputResponses
    });
    const bcoinApp = new LedgerBcoin({
      device: device
    });

    const response = await bcoinApp.getTrustedInput(tx, 1);

    assert.bufferEqual(response, getTrustedInputResponses[12].slice(0, -2));

    const commands = device.getCommands();

    for (let i = 0; i < commands.length; i++) {
      assert.bufferEqual(commands[i], getTrustedInputCommands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(commands.length, getTrustedInputCommands.length,
      'Number of messages doesn\'t match'
    );
  });
});
