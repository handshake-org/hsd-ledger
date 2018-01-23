/*!
 * bcoin.js - Ledger communication with bcoin primitives
 * Copyright (c) 2017, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const util = require('./utils/util');
const utilTX = require('./utils/transaction');

const Network = require('bcoin/lib/protocol/network');

const TX = require('bcoin/lib/primitives/tx');
const MTX = require('bcoin/lib/primitives/mtx');

const HDPublicKey = require('bcoin/lib/hd/public');
const Script = require('bcoin/lib/script').Script;

const secp256k1 = require('bcrypto').secp256k1;
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
    this.network = Network.primary;

    if (options)
      this.set(options);
  }

  /**
   * Set options
   * @param {Object} options
   */

  set(options) {
    assert(options);

    if (options.network)
      this.network = Network.get(options.network);

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

    return this;
  }

  /**
   * Get public key
   * @async
   * @param {(Number[]|String)} [path=this.path] - Full derivation path
   * @param {Network?} network
   * @returns {HDPublicKey}
   * @throws {LedgerError}
   */

  async getPublicKey(path = this.path, network = this.network) {
    assert(this.device);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    assert(Array.isArray(path), 'Path must be string or array');

    const indexes = path;
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
      publicKey: compressedPubkey,
      network: this.network
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
   * @param {String} inputKey - Prevout to key
   * @param {bcoin.Script} prev - prev script for current input
   * @param {Object} tis - trusted inputs map[prevoutKey] = trustedInput
   * @param {Boolean?} [isNew=false] - is new transaction
   * @throws {LedgerError}
   */

  async hashTransactionStart(tx, inputKey, prev, tis = {}, isNew = false) {
    assert(this.device);

    if (Buffer.isBuffer(tx))
      tx = TX.fromRaw(tx);

    assert(TX.isTX(tx));

    const ntx = tx.clone();

    // nullify other input scripts
    for (const input of ntx.inputs) {
      const prevoutKey = input.prevout.toKey();

      if (prevoutKey === inputKey)
        input.script = prev;
      else
        input.script = NULL_SCRIPT;
    }

    const packets = [APDUCommand.hashTransactionStart(
      utilTX.splitVersionInputs(tx),
      true,
      isNew
    )];

    for (const input of ntx.inputs) {
      const prevoutKey = input.prevout.toKey();
      let buffer;

      if (!tis[prevoutKey]) {
        const outpointSize = input.prevout.getSize(); // always 36
        const scriptSize = input.script.getSize();
        const scriptVarintSize = encoding.sizeVarint(scriptSize);
        buffer = bufio.static(1 + outpointSize + scriptVarintSize);

        buffer.writeU8(0x00);
        input.prevout.toWriter(buffer);
        buffer.writeVarint(scriptSize);
      } else {
        // Trusted input
        const scriptSize = input.script.getSize();
        const scriptVarintSize = encoding.sizeVarint(scriptSize);
        buffer = bufio.static(2 + tis[prevoutKey].length + scriptVarintSize);

        buffer.writeU8(0x01);
        buffer.writeU8(tis[prevoutKey].length);
        buffer.writeBytes(tis[prevoutKey]);
        buffer.writeVarint(scriptSize);
      }

      packets.push(APDUCommand.hashTransactionStart(
        buffer.render(),
        false,
        isNew
      ));

      const scripts = utilTX.splitBuffer(
        input.script.toRaw(),
        utilTX.MAX_SCRIPT_BLOCK,
        true
      );
      const last = scripts.pop();
      const sequence = bufio.static(last.length + 4);

      sequence.writeBytes(last);
      sequence.writeU32(input.sequence);

      scripts.push(sequence.render());

      for (const script of scripts) {
        packets.push(APDUCommand.hashTransactionStart(
          script,
          false,
          isNew
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

  /**
   * Sign the processed transaction
   * @async
   * @param {String|Numbers[]} path
   * @param {TX|Buffer} tx
   * @param {SighashType} type
   * @returns {Buffer} signed hash
   * @throws {LedgerError}
   */

  async hashSign(tx, path, type) {
    assert(this.device);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    if (Buffer.isBuffer(tx))
      tx = TX.fromRaw(tx);

    const packet = APDUCommand.hashSign(path, tx.locktime, type);
    const res = await this.device.exchange(packet.toRaw());

    return APDUResponse.hashSign(res).data;
  }

  /**
   * Sign transaction
   * @async
   * @param {MTX} tx
   * @param {LedgerTXInput[]} ledgerInputs
   * @returns {TX}
   */

  async signTransaction(tx, ledgerInputs) {
    assert(MTX.isMTX(tx), 'Cannot use non-MTX tx for signing');

    const trustedInputs = Object.create(null);
    const txIndexByKey = Object.create(null);

    // Update public keys for keyrings
    for (const li of ledgerInputs) {
      if (!li.publicKey) {
        const hd = await this.getPublicKey(li.path);
        li.publicKey = hd.publicKey;
      }
    }

    // Collect trusted inputs
    for (const li of ledgerInputs) {
      if (li.redeem)
        continue;

      const pokey = li.toKey();
      const trustedInput = await this.getTrustedInput(li.tx, li.index);

      trustedInputs[pokey] = trustedInput;
    }

    // Find indexes in transaction
    for (const [i, input] of tx.inputs.entries()) {
      const pokey = input.prevout.toKey();

      txIndexByKey[pokey] = i;
    }

    let newtx = true;
    for (const li of ledgerInputs) {
      const pokey = li.toKey();
      const index = txIndexByKey[pokey];

      await this.signInput(tx, li, trustedInputs, index, newtx);
      newtx = false;
    }

    return tx;
  }

  /**
   * Sign input
   * @param {MTX} tx
   * @param {SignInput} signInput
   * @param {Buffer[]} trustedInputs
   * @param {Number} index - Input index in new tx
   * @param {Boolean} isNew - is it new transaction
   * @returns {MTX}
   */

  async signInput(tx, signInput, trustedInputs, index, isNew = false) {
    const input = tx.inputs[index];
    const inputKey = signInput.toKey();
    const ring = signInput.getRing(this.network);
    const coin = signInput.getCoin();

    // Get the previous output's script
    const vector = input.script;
    let prev = coin.script;
    let redeem = false;

    // Grab regular p2sh redeem script.
    if (prev.isScripthash()) {
      prev = signInput.redeem;
      if (!prev)
        throw new Error('Redeem script not found');
      redeem = true;
    }

    if (redeem)
      trustedInputs = {};

    await this.hashTransactionStart(tx, inputKey, prev, trustedInputs, isNew);

    // TODO(node): use returned user validation flags
    await this.hashOutputFinalize(tx);

    const signature = await this.hashSign(tx, signInput.path, signInput.type);

    tx.scriptInput(index, coin, ring);

    if (redeem) {
      const stack = vector.toStack();
      const redeem = stack.pop();

      const result = tx.signVector(prev, stack, signature, ring);

      if (!result)
        return false;

      result.push(redeem);

      vector.fromStack(result);

      return true;
    }

    const stack = vector.toStack();
    const result = tx.signVector(prev, stack, signature, ring);

    if (!result)
      return false;

    vector.fromStack(result);

    return true;
  }
}

module.exports = LedgerBcoin;
