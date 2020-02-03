'use strict';

const assert = require('bsert');
const bufio = require('bufio');
const {Address, hd, Rules} = require('hsd');

/**
 * Index at which hardening begins.
 * @const {Number}
 * @default
 */

exports.HARDENED = hd.common.HARDENED;

/**
 * Return a hardened representation of the BIP44 index.
 * @param {Number} index - the value to harden.
 * @returns {Number}
 */

exports.harden = (index) => {
  index |= this.HARDENED;
  return (index >>>= 0);
};

/*
 * Reverse object keys to values
 * @param {Object} object
 * @returns {Object} with reverse keys and values
 */

exports.reverse = (object) => {
  const reversed = {};

  for (const key of Object.keys(object))
    reversed[object[key]] = key;

  return reversed;
};

/**
 * Hardened BIP 44 purpose index.
 * @const
 */

exports.BIP44_PURPOSE = this.harden(44);

/**
 * Map of Hardened BIP 44 coin types keyed by network.
 * @const
 */

exports.BIP44_COIN_TYPE = {
  'main': this.harden(5353),
  'testnet': this.harden(5354),
  'regtest': this.harden(5355),
  'simnet': this.harden(5356)
};

/**
 * Max size of command input data sent to Ledger device.
 * @const {Number}
 * @default
 */

exports.MAX_TX_PACKET = 255;

/**
 * Max size of script packets sent to Ledger device.
 * @const {Number}
 * @default
 */

exports.MAX_SCRIPT_PACKET = 182;

/**
 * Split buffer to multiple chunks.
 * @param {Buffer} data
 * @param {Number} size - chunk size
 * @param {Boolean?} zeroCopy - Don't reallocate buffers
 * @returns {Buffer[]}
 */

exports.splitBuffer = (data, size, zeroCopy = false) => {
  const br = bufio.read(data, zeroCopy);
  const msgs = [];

  while(br.left() > size) {
    msgs.push(br.readBytes(size));
  }

  msgs.push(br.readBytes(br.left()));

  return msgs;
};

/**
 * Parse a derivation path and return an array of indexes.
 * @see https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki
 * @param {String} path
 * @param {Boolean} hard
 * @returns {Number[]}
 */

exports.parsePath = hd.common.parsePath;

/**
 * Displays mtx details.
 * @param {Logger} logger
 * @param {MTX} mtx
 * @param {Object} options
 */

exports.displayDetails = (logger, network, mtx, options) => {
  let fees = 0;

  for (let i = 0; i < mtx.inputs.length; i++) {
    const input = mtx.inputs[i];
    const coin = mtx.view.getCoinFor(input);
    fees += coin.value;
  }

  logger.info('Verify tx details on Ledger device.');
  logger.info('');

  for (let i = 0, j = 1; i < mtx.outputs.length; i++) {
    const output = mtx.outputs[i];
    fees -= output.value;

    if (options && options.change && options.change.getIndex() === i)
      continue;

    logger.info(`Output #${j++}`);
    logger.info(`Covenant: ${Rules.typesByVal[output.covenant.type]}`);

    if (output.covenant.type !== Rules.types.NONE) {
      assert(options && options.covenants, 'LedgerCovenants required.');

      let name;

      for (const covenant of options.covenants)
        if (covenant.getIndex() === i)
          name = covenant.getName();

      logger.info(`Name: ${name}`);
    }

    if (output.covenant.type === Rules.types.TRANSFER) {
      const ver = output.covenant.getU8(2);
      const hash = output.covenant.get(3);
      const addr = Address.fromHash(hash, ver);
      logger.info(`New Owner: ${addr.toString(network)}`);
    }

    logger.info(`Value: ${output.value/1e6}`);
    logger.info(`Address: ${output.address.toString(network)}`);
    logger.info('');
  }

  logger.info(`Fees: ${fees/1e6}`);
};
