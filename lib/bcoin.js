/*!
 * bcoin.js - Ledger communication with bcoin primitives
 * Copyright (c) 2017, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const util = require('./utils/util');

const HDPublicKey = require('bcoin/lib/hd/public');
const TX = require('bcoin/lib/primitives/tx');

// const secp256k1 = require('bcrypto').secp256k1;
const secp256k1 = require('bcoin/lib/crypto/secp256k1');
const bufio = require('bufio');
const {encoding} = bufio;

const {Device} = require('./device');
const APDU = require('./apdu');
const {APDUCommand, APDUResponse} = APDU;

const DEFAULT_PATH = 'm/0\'/0\'/0\'';

/**
 * Ledger BTC App with bcoin primitives
 */

class LedgerBcoin {
  /**
   * Create ledger bcoin app
   * @constructor
   * @param {Object} options
   * @param {String} options.path
   * @param {Device} options.device
   */

  constructor(options) {
    this.device = null;
    this.path = DEFAULT_PATH;

    if (options)
      this.set(options);
  }

  /**
   * Set options
   * @param {Object} options
   */

  set(options) {
    assert(options);

    if (options.device != null) {
      assert(options.device instanceof Device);
      this.device = options.device;
      this.device.set({
        scrambleKey: 'BTC'
      });
    }

    if (options.path != null) {
      assert(typeof options.path === 'string');

      // validate path
      util.parsePath(options.path, true);

      this.path = options.path;
    }
  }

  /**
   * Get public key
   * @async
   * @param {String?} path - Full derivation path
   * @returns {HDPublicKey}
   */

  async getPublicKey(path = this.path) {
    assert(this.device);

    const indexes = util.parsePath(path, true);
    const command = APDUCommand.getPublicKey(indexes);
    const responseBuffer = await this.device.exchange(command.toRaw());
    const response = APDUResponse.getPublicKey(responseBuffer);

    const rawPubkey = response.data.publicKey;
    const compressedPubkey = secp256k1.publicKeyConvert(rawPubkey, true);

    return new HDPublicKey({
      depth: indexes.length,
      childIndex: indexes[indexes.length - 1],
      parentFingerPrint: 0,
      chainCode: response.data.chainCode,
      publicKey: compressedPubkey
    });
  }

  /**
   * Get trusted input
   * @param {TX|Buffer} tx
   * @param {Number} inputIndex
   * @returns {Buffer} trustedInput
   */

  async getTrustedInput(tx, inputIndex) {
    assert(this.device);

    if (Buffer.isBuffer(tx))
      tx = TX.fromRaw(tx);

    assert(TX.isTX(tx), 'Pass transaction or buffer');

    // send transaction version with inputIndex
    // Sending first message
    {
      const size = 8 + encoding.sizeVarint(tx.inputs.length);
      const message = bufio.static(size);

      message.writeU32BE(inputIndex);
      message.writeU32(tx.version);
      message.writeVarint(tx.inputs.length);

      const buffer = message.render();
      const packet = APDUCommand.getTrustedInput(buffer, true);

      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.getTrustedInput(res);
    }

    // sending inputs
    for (const input of tx.inputs) {
      // send prevout and script varint
      {
        const scriptSize = input.script.getSize();
        const size = 36 + encoding.sizeVarint(scriptSize);
        const message = bufio.static(size);

        input.prevout.toWriter(message);
        message.writeVarint(scriptSize);

        const buffer = message.render();
        const packet = APDUCommand.getTrustedInput(buffer);

        const res = await this.device.exchange(packet.toRaw());
        APDUResponse.getTrustedInput(res);
      }

      // send scripts
      const rawScript = input.script.toRaw();
      const messages = util.splitBuffer(rawScript, 50);

      const lastMessage = messages.pop();

      for (const message of messages) {
        const packet = APDUCommand.getTrustedInput(message);
        const res = await this.device.exchange(packet.toRaw());
        APDUResponse.getTrustedInput(res);
      }

      // last script block and sequence
      const last = bufio.static(lastMessage.length + 4);
      last.writeBytes(lastMessage);
      last.writeU32(input.sequence);

      const message = last.render();
      const packet = APDUCommand.getTrustedInput(message);

      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.getTrustedInput(res);
    }

    // send outputs length
    {
      const size = encoding.sizeVarint(tx.outputs.length);
      const message = bufio.static(size);

      message.writeVarint(tx.outputs.length);

      const packet = APDUCommand.getTrustedInput(message.render());

      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.getTrustedInput(res);
    }

    // send outputs
    for (const output of tx.outputs) {
      const size = output.getSize();
      const message = bufio.static(size);

      output.toWriter(message);

      const packet = APDUCommand.getTrustedInput(message.render());

      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.getTrustedInput(res);
    }

    // send locktime
    {
      const message = bufio.static(4);
      message.writeU32(tx.locktime);

      const packet = APDUCommand.getTrustedInput(message.render());

      const res = await this.device.exchange(packet.toRaw());
      return APDUResponse.getTrustedInput(res).data;
    }
  }
}

module.exports = LedgerBcoin;
