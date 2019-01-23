'use strict';

const assert = require('bsert');
const bufio = require('bufio');

/**
 * Index at which hardening begins.
 * @const {Number}
 * @default
 */

const HARDENED = 0x80000000;

/**
 * Size where we break scripts.
 * @const {Number}
 * @default
 */

exports.MAX_SCRIPT_BLOCK = 50;

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

exports.parsePath = (path, hard) => {
  assert(typeof path === 'string');
  assert(typeof hard === 'boolean');
  assert(path.length >= 1);
  assert(path.length <= 3062);

  const parts = path.split('/');
  const root = parts[0];

  if (root !== 'm'
      && root !== 'M'
      && root !== 'm\''
      && root !== 'M\'') {
    throw new Error('Invalid path root.');
  }

  const result = [];

  for (let i = 1; i < parts.length; i++) {
    let part = parts[i];

    const hardened = part[part.length - 1] === '\'';

    if (hardened)
      part = part.slice(0, -1);

    if (part.length > 10)
      throw new Error('Path index too large.');

    if (!/^\d+$/.test(part))
      throw new Error('Path index is non-numeric.');

    let index = parseInt(part, 10);

    if ((index >>> 0) !== index)
      throw new Error('Path index out of range.');

    if (hardened) {
      index |= HARDENED;
      index >>>= 0;
    }

    if (!hard && (index & HARDENED))
      throw new Error('Path index cannot be hardened.');

    result.push(index);
  }

  return result;
};
