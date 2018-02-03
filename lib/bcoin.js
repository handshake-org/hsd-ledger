/*!
 * bcoin.js - Ledger communication with bcoin primitives
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const util = require('./utils/util');
const utilTX = require('./utils/transaction');

const {Lock} = require('bmutex');
const Network = require('bcoin/lib/protocol/network');

const TX = require('bcoin/lib/primitives/tx');
const MTX = require('bcoin/lib/primitives/mtx');

const HDPublicKey = require('bcoin/lib/hd/public');
const Script = require('bcoin/lib/script').Script;

const secp256k1 = require('bcrypto').secp256k1;
const bufio = require('bufio');
const {encoding} = bufio;

const LedgerProtocol = require('./protocol');
const {APDUCommand, APDUResponse} = LedgerProtocol;
const {Device} = require('./devices/device');

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

    this.signingTX = false;
    this.txlock = new Lock(false);

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
   * @param {bcoin.Network?} network
   * @returns {bcoin.HDPublicKey}
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
   * @param {bcoin.TX|Buffer} tx
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

  async hashTransactionStart(tx, tis = {}, isNew, hasWitness) {
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

      if (tis[prevoutKey]) {
        // Trusted input
        const scriptSize = input.script.getSize();
        const scriptVarintSize = encoding.sizeVarint(scriptSize);
        buffer = bufio.write(2 + tis[prevoutKey].length + scriptVarintSize);

        buffer.writeU8(0x01);
        buffer.writeU8(tis[prevoutKey].length);
        buffer.writeBytes(tis[prevoutKey]);
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
   * @param {Object} [tis={}] - trusted inputs map[prevoutKey] = trustedInput
   * @param {Boolean} [isNew=false] - is new transaction
   * @param {boolean} [witness=false] - is v1 transaction
   * @throws {LedgerError}
   */

  async hashTransactionStartNullify(mtx, key, prev, tis = {}, isNew, witness) {
    assert(this.device);
    assert(MTX.isMTX(mtx));

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

    await this.hashTransactionStart(newTX, {}, false, true);
  }

  /**
   * Send and verify outputs
   * @async
   * @param {bcoin.TX|Buffer} tx
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
   * @param {bcoin.TX|Buffer} tx
   * @param {bcoin.Script.SighashType} type
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
   * @param {bcoin.MTX} tx - mutable transaction
   * @param {LedgerTXInput[]} ledgerInputs
   * @returns {MTX} - signed mutable transaction
   * @throws {LedgerError}
   * @throws {AssertionError}
   */

  async signTransaction(tx, ledgerInputs) {
    assert(MTX.isMTX(tx), 'Cannot use non-MTX tx for signing');

    // Ledger should finish signing one transaction
    // in order to sign another
    const unlock = await this.txlock.lock();

    this.signingTX = true;

    const trustedInputs = Object.create(null);
    const txIndexByKey = Object.create(null);

    let hasWitness = false;

    // Update public keys for keyrings
    for (const li of ledgerInputs) {
      if (!li.publicKey) {
        const hd = await this.getPublicKey(li.path);
        li.publicKey = hd.publicKey;
      }
    }

    // Collect trusted inputs
    for (const li of ledgerInputs) {
      if (li.witness) {
        hasWitness = true;
        continue;
      }

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

    if (hasWitness) {
      // load transaction with all inputs for caching hashing data
      await this.hashTransactionStart(tx, {}, true, true);
      await this.hashOutputFinalize(tx);

      newtx = false;
    }

    for (const li of ledgerInputs) {
      const pokey = li.toKey();
      const index = txIndexByKey[pokey];

      await this.signInput(tx, li, trustedInputs, index, newtx);
      newtx = false;
    }

    unlock();
    this.signingTX = false;

    return tx;
  }

  /**
   * Sign input
   * @param {bcoin.MTX} tx - mutable transaction
   * @param {LedgerTXInput} ledgerInput
   * @param {Buffer[]} trustedInputs
   * @param {Number} index - Input index in new tx
   * @param {Boolean} isNew - is it new transaction
   * @returns {bcoin.MTX}
   * @see {bcoin.MTX#signInput}
   * @see {bcoin.MTX#scriptInput}
   */

  async signInput(tx, ledgerInput, trustedInputs, index, isNew = false) {
    const input = tx.inputs[index];
    const inputKey = ledgerInput.toKey();
    const ring = ledgerInput.getRing(this.network);
    const coin = ledgerInput.getCoin();

    const templated = tx.scriptInput(index, coin, ring);

    if (!templated)
      throw new Error('Could not template input');

    // Get the previous output's script
    let prev = coin.script;
    let vector = input.script;
    let redeem = false;
    let witness = false;

    // Grab regular p2sh redeem script.
    if (prev.isScripthash()) {
      prev = input.script.getRedeem();

      if (!prev)
        throw new Error('Redeem Script not found');
      redeem = true;
    }

    // If the output script is a witness program,
    // we have to switch the vector to the witness
    // and potentially alter the length. Note that
    // witnesses are stack items, so the `dummy`
    // _has_ to be an empty buffer (what OP_0
    // pushes onto the stack).
    if (prev.isWitnessScripthash()) {
      prev = input.witness.getRedeem();

      if (!prev)
        throw new Error('Input has not been templated.');
      vector = input.witness;
      redeem = true;
      witness = true;
    } else {
      const wpkh = prev.getWitnessPubkeyhash();
      if (wpkh) {
        prev = Script.fromPubkeyhash(wpkh);
        vector = input.witness;
        redeem = false;
        witness = true;
      }
    }

    if (!witness) {
      await this.hashTransactionStartNullify(
        tx,
        inputKey,
        prev,
        trustedInputs,
        isNew,
        witness
      );

      await this.hashOutputFinalize(tx);
    } else {
      await this.hashTransactionStartSegwit(tx, inputKey, prev);
    }

    const sig = await this.hashSign(tx, ledgerInput.path, ledgerInput.type);

    if (redeem) {
      const stack = vector.toStack();
      const redeem = stack.pop();

      const result = tx.signVector(prev, stack, sig, ring);

      if (!result)
        return false;

      result.push(redeem);

      vector.fromStack(result);

      return true;
    }

    const stack = vector.toStack();
    const result = tx.signVector(prev, stack, sig, ring);

    if (!result)
      return false;

    vector.fromStack(result);

    return true;
  }
}

module.exports = LedgerBcoin;
