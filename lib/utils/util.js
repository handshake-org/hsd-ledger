'use strict';

const assert = require('bsert');
const bufio = require('bufio');
const common = require('hsd/lib/hd/common');

/**
 * Index at which hardening begins.
 * @const {Number}
 * @default
 */

exports.HARDENED = common.HARDENED;

/**
 * BIP 44 purpose index.
 * @const
 */

exports.BIP44_PURPOSE = 44;

/**
 * Map of BIP 44 coin type indices keyed by network.
 * @const
 */

exports.BIP44_COIN_TYPE = {
  'main': 5353,
  'testnet': 5354,
  'regtest': 5355,
  'simnet': 5356
}

/**
 * Size of script packets sent to Ledger device.
 * @const {Number}
 * @default
 */

exports.MAX_SCRIPT_BLOCK = 50;

/**
 * Return a hardened representation of the BIP44 index.
 * @param {Number} index
 * @returns {Number}
 */
exports.harden = (index) => {
  index |= this.HARDENED;
  return index >>>= 0;
}

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

exports.parsePath = common.parsePath;
