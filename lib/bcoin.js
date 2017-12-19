/*!
 * bcoin.js - Ledger communication with bcoin primitives
 * Copyright (c) 2017, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const util = require('./utils/util');
const utilTX = require('./utils/transaction');
const LedgerError = require('./error');

const HDPublicKey = require('bcoin/lib/hd/public');
const TX = require('bcoin/lib/primitives/tx');
const Script = require('bcoin/lib/script').Script;

// const secp256k1 = require('bcrypto').secp256k1;
const secp256k1 = require('bcoin/lib/crypto/secp256k1');
const bufio = require('bufio');
const {encoding} = bufio;

const {Device} = require('./device');
const APDU = require('./apdu');
const {APDUCommand, APDUResponse} = APDU;

const DEFAULT_PATH = 'm/0\'/0\'/0\'';

const NULL_SCRIPT = new Script();

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
   * @throws {LedgerError}
   */

  async getTrustedInput(tx, inputIndex) {
    assert(this.device);

    if (Buffer.isBuffer(tx))
      tx = TX.fromRaw(tx);

    assert(TX.isTX(tx));

    const messages = utilTX.splitTransaction(tx);

    // first packet must contain inputIndex
    const firstMessage = bufio.static(messages[0].length + 4);
    firstMessage.writeU32BE(inputIndex);
    firstMessage.writeBytes(messages[0]);
    messages[0] = firstMessage.render();

    const last = messages.pop();

    let first = true;
    for (const message of messages) {
      const packet = APDUCommand.getTrustedInput(message, first);
      const res = await this.device.exchange(packet.toRaw());

      // check if throws
      APDUResponse.getTrustedInput(res);
      first = false;
    }

    const packet = APDUCommand.getTrustedInput(last, false);
    const res = await this.device.exchange(packet.toRaw());

    return APDUResponse.getTrustedInput(res).data;
  }

  /**
   * start composing tx
   * @async
   * @param {Buffer} tx
   * @param {Number} inputIndex
   * @param {Buffer[]} tis - trusted inputs
   * @param {Boolean?} [isNtx=false] - is new transaction
   * @throws {LedgerError}
   */

  async hashTransactionStart(tx, inputIdx, tis = [], isNtx = false) {
    assert(this.device);

    if (Buffer.isBuffer(tx))
      tx = TX.fromRaw(tx);

    assert(TX.isTX(tx));

    const ntx = tx.clone();

    // nullify other input scripts
    for (const [i, input] of ntx.inputs.entries()) {
      if (i !== inputIdx)
        input.script = NULL_SCRIPT;
    }

    const packets = [APDUCommand.hashTransactionStart(
      utilTX.splitVersionInputs(tx),
      true,
      isNtx
    )];

    for (const [i, input] of ntx.inputs.entries()) {
      if (!tis[i]) {
        throw new LedgerError('Not Implemented Yet');
      }

      // Trusted input
      const scriptSize = input.script.getSize();
      const scriptVarintSize = encoding.sizeVarint(scriptSize);
      const buffer = bufio.static(2 + tis[i].length + scriptVarintSize);

      buffer.writeU8(0x01);
      buffer.writeU8(tis[i].length);
      buffer.writeBytes(tis[i]);
      buffer.writeVarint(scriptSize);

      packets.push(APDUCommand.hashTransactionStart(
        buffer.render(),
        false,
        isNtx
      ));

      const scripts = utilTX.splitBuffer(input.script.toRaw());
      const last = scripts.pop();
      const sequence = bufio.static(last.length + 4);

      sequence.writeBytes(last);
      sequence.writeU32(input.sequence);

      scripts.push(sequence.render());

      for (const script of scripts) {
        packets.push(APDUCommand.hashTransactionStart(
          script,
          false,
          isNtx
        ));
      }
    }

    for (const packet of packets) {
      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.hashTransactionStart(res);
    }
  }

  /**
   * Send and verify outputs
   * @async
   * @param {TX|Buffer} tx
   * @returns {Boolean[]}
   * @throws {LedgerError}
   */

  async hashOutputFinalize(tx) {
    assert(this.device);

    if (Buffer.isBuffer(tx))
      tx = TX.fromRaw(tx);

    assert(TX.isTX(tx));

    let size = encoding.sizeVarint(tx.outputs.length);

    for (const output of tx.outputs)
      size += output.getSize();

    const outputs = bufio.static(size);

    outputs.writeVarint(tx.outputs.length);

    for (const output of tx.outputs)
      output.toWriter(outputs);

    const messages = utilTX.splitBuffer(outputs.render(),
      utilTX.MAX_SCRIPT_BLOCK);

    const lastMessage = messages.pop();

    for (const message of messages) {
      const packet = APDUCommand.hashOutputFinalize(message, true);
      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.hashOutputFinalize(res);
    }

    const lastPacket = APDUCommand.hashOutputFinalize(lastMessage, false);
    const res = await this.device.exchange(lastPacket.toRaw());
    return APDUResponse.hashOutputFinalize(res).data;
  }
}

module.exports = LedgerBcoin;
