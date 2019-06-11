'use strict';

const bufio = require('bufio');
const common = require('hsd/lib/hd/common');

/**
 * Index at which hardening begins.
 * @const {Number}
 * @default
 */

exports.HARDENED = common.HARDENED;

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

exports.parsePath = common.parsePath;
