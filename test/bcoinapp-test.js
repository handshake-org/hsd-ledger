
/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('./util/assert');
const utils = require('./util/utils');
const {Device} = require('./util/device');
const LedgerBcoin = require('../lib/bcoin');

const getTrustedInput = utils.getCommands('data/getTrustedInput.json');
const hashTxStart = utils.getCommands('data/hashTransactionStart.json');

describe('Bitcoin App', function () {
  it('should handle getTrustedInput commands', async () => {
    const {tx, responses, commands} = getTrustedInput;

    const device = new Device({
      responses: responses
    });

    const bcoinApp = new LedgerBcoin({
      device: device
    });

    const response = await bcoinApp.getTrustedInput(tx, 1);

    assert.bufferEqual(response, responses[12].slice(0, -2));

    const deviceCommands = device.getCommands();

    for (let i = 0; i < deviceCommands.length; i++) {
      assert.bufferEqual(deviceCommands[i], commands[i],
        `Message ${i} wasn't correct`
      );
    }

    assert.strictEqual(commands.length, deviceCommands.length,
      'Number of messages doesn\'t match'
    );
  });

  it('should handle hashTransactionStart commands', async () => {
    const {data, tx, responses, commands} = hashTxStart;

    const tis = data.trusted.map(ti => Buffer.from(ti, 'hex'));

    const device = new Device({
      responses: responses
    });

    const bcoinApp = new LedgerBcoin({
      device: device
    });

    await bcoinApp.hashTransactionStart(tx, 0, tis, true);

    const deviceCommands = device.getCommands();

    for (let i = 0; i < deviceCommands.length; i++) {
      assert.bufferEqual(deviceCommands[i], commands[i],
        `Message ${i} wasn't correct`
      );
    }
  });
});
