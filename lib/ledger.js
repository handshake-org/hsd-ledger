/*!
 * ledger.js - Ledger layer for BTC App
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';
const assert = require('assert');
const util = require('./utils/util');
const utilTX = require('./utils/transaction');

const TX = require('bcoin/lib/primitives/tx');
const MTX = require('bcoin/lib/primitives/mtx');
const Script = require('bcoin/lib/script').Script;

const bufio = require('bufio');
const {encoding} = bufio;

const LedgerProtocol = require('./protocol');
const {APDUCommand, APDUResponse} = LedgerProtocol;
const {Device} = require('./devices/device');

const NULL_SCRIPT = new Script();

/**
 * Ledger BTC App methods
 * @see https://ledgerhq.github.io/btchip-doc/bitcoin-technical-beta.html
 */

class LedgerBTCApp {
  /**
   * Create ledger bcoin app
   * @constructor
   * @param {Device} device
   */

  constructor(device) {
    assert(device instanceof Device);
    this.device = device;
  }

  /**
   * Get public key
   * @async
   * @param {(Number[]|String)} - Full derivation path
   * @param {apdu.addressFlags} - Verify and address types
   * @returns {Object} - publicKey, chainCode
   * @throws {LedgerError}
   */

  async getPublicKey(path, addressFlags) {
    assert(this.device);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    assert(Array.isArray(path), 'Path must be string or array');

    const indexes = path;
    const command = APDUCommand.getPublicKey(indexes, addressFlags);
    const responseBuffer = await this.device.exchange(command.toRaw());
    const response = APDUResponse.getPublicKey(responseBuffer);

    return response.data;
  }

  /**
   * Get trusted input
   * @param {bcoin.TX} tx
   * @param {Number} inputIndex
   * @returns {Buffer} trustedInput
   * @throws {LedgerError}
   */

  async getTrustedInput(tx, inputIndex) {
    assert(this.device);
    assert(TX.isTX(tx));

    const messages = utilTX.splitTransaction(tx);

    // first packet must contain inputIndex
    const firstMessage = bufio.write(messages[0].length + 4);
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
   * Start composing tx
   * @async
   * @param {bcoin.MTX} tx - Mutable transaction
   * @param {Object} [tis={}] - trusted inputs
   * @param {Boolean} [isNew=false]
   * @param {Boolean} [witness=false] - is v1 tx
   * @throws {LedgerError}
   */

  async hashTransactionStart(tx, tis = new Map(), isNew, hasWitness) {
    assert(this.device);
    assert(MTX.isMTX(tx));

    const packets = [APDUCommand.hashTransactionStart(
      utilTX.splitVersionInputs(tx),
      true,
      isNew,
      hasWitness
    )];

    for (const input of tx.inputs) {
      const prevoutKey = input.prevout.toKey();
      let buffer;

      if (tis.get(prevoutKey)) {
        const ti = tis.get(prevoutKey);

        // Trusted input
        const scriptSize = input.script.getSize();
        const scriptVarintSize = encoding.sizeVarint(scriptSize);
        buffer = bufio.write(2 + ti.length + scriptVarintSize);

        buffer.writeU8(0x01);
        buffer.writeU8(ti.length);
        buffer.writeBytes(ti);
        buffer.writeVarint(scriptSize);
      } else if (hasWitness) {
        // Prevout + Amount
        const outpointSize = input.prevout.getSize();
        const amountSize = 8;
        const scriptSize = input.script.getSize();
        const scriptVarintSize = encoding.sizeVarint(scriptSize);
        const coin = tx.view.getCoinFor(input);

        buffer = bufio.write(1 + amountSize + outpointSize + scriptVarintSize);

        buffer.writeU8(0x02);
        input.prevout.toWriter(buffer);
        buffer.writeI64(coin.value);
        buffer.writeVarint(scriptSize);
      } else {
        // Prevout
        const outpointSize = input.prevout.getSize(); // always 36
        const scriptSize = input.script.getSize();
        const scriptVarintSize = encoding.sizeVarint(scriptSize);
        buffer = bufio.write(1 + outpointSize + scriptVarintSize);

        buffer.writeU8(0x00);
        input.prevout.toWriter(buffer);
        buffer.writeVarint(scriptSize);
      }

      packets.push(APDUCommand.hashTransactionStart(
        buffer.render(),
        false,
        isNew,
        hasWitness
      ));

      const scripts = utilTX.splitBuffer(
        input.script.toRaw(),
        utilTX.MAX_SCRIPT_BLOCK,
        true
      );
      const last = scripts.pop();
      const sequence = bufio.write(last.length + 4);

      sequence.writeBytes(last);
      sequence.writeU32(input.sequence);

      scripts.push(sequence.render());

      for (const script of scripts) {
        packets.push(APDUCommand.hashTransactionStart(
          script,
          false,
          isNew,
          hasWitness
        ));
      }
    }

    for (const packet of packets) {
      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.hashTransactionStart(res);
    }
  }

  /**
   * Nullify other scripts and start sending inputs
   * @async
   * @param {bcoin.MTX} mtx - mutable transaction
   * @param {String} key - Prevout to key
   * @param {bcoin.Script} prev - prev script for current input
   * @param {Object} [tis=Map] - trusted inputs map[prevoutKey] = trustedInput
   * @param {Boolean} [isNew=false] - is new transaction
   * @param {boolean} [witness=false] - is v1 transaction
   * @throws {LedgerError}
   */

  async hashTransactionStartNullify(mtx, key, prev, tis, isNew, witness) {
    assert(this.device);
    assert(MTX.isMTX(mtx));

    if (!tis)
      tis = new Map();

    const newTX = mtx.clone();
    newTX.view = mtx.view;

    // nullify other input scripts
    for (const input of newTX.inputs) {
      const prevoutKey = input.prevout.toKey();

      if (prevoutKey === key)
        input.script = prev;
      else
        input.script = NULL_SCRIPT;
    }

    await this.hashTransactionStart(newTX, tis, isNew, witness);
  }

  /**
   * @async
   * @param {bcoin.TX} tx
   * @param {String} key - Prevout to Key(String)
   * @param {bcoin.Script} prev - prev script for current input
   * @throws {LedgerError}
   */

  async hashTransactionStartSegwit(tx, key, prev) {
    assert(this.device);
    assert(TX.isTX(tx));

    const newTX = tx.clone();
    newTX.view = tx.view;

    const inputs = [];

    for (const input of newTX.inputs) {
      const prevoutKey = input.prevout.toKey();

      if (prevoutKey === key) {
        input.script = prev;
        inputs.push(input);
        break;
      }
    }

    newTX.inputs = inputs;

    await this.hashTransactionStart(newTX, new Map(), false, true);
  }

  /**
   * Send and verify outputs
   * @async
   * @param {bcoin.TX} tx
   * @returns {Boolean[]}
   * @throws {LedgerError}
   */

  async hashOutputFinalize(tx) {
    assert(this.device);
    assert(TX.isTX(tx));

    let size = encoding.sizeVarint(tx.outputs.length);

    for (const output of tx.outputs)
      size += output.getSize();

    const outputs = bufio.write(size);

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

  /**
   * Sign the processed transaction
   * @async
   * @param {String|Numbers[]} path
   * @param {bcoin.TX} tx
   * @param {bcoin.Script.SighashType} type
   * @returns {Buffer} signed hash
   * @throws {LedgerError}
   */

  async hashSign(tx, path, type) {
    assert(this.device);
    assert(TX.isTX(tx));

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    const packet = APDUCommand.hashSign(path, tx.locktime, type);
    const res = await this.device.exchange(packet.toRaw());

    return APDUResponse.hashSign(res).data;
  }
}

LedgerBTCApp.addressFlags = LedgerProtocol.APDU.addressFlags;

module.exports = LedgerBTCApp;
