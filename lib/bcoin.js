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

const Network = require('bcoin/lib/protocol/network');

const TX = require('bcoin/lib/primitives/tx');
const MTX = require('bcoin/lib/primitives/mtx');
const Outpoint = require('bcoin/lib/primitives/outpoint');
const Coin = require('bcoin/lib/primitives/coin');
const KeyRing = require('bcoin/lib/primitives/keyring');

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
  }

  /**
   * Get public key
   * @async
   * @param {Number[]?|String?} path - Full derivation path
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
   * Get KeyRing from HDPublicKey
   * @private
   * @param {HDPublicKey} hd
   * @returns {KeyRing}
   */

  ringFromHD(hd) {
    return KeyRing.fromPublic(hd.publicKey, this.network);
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
   * @param {Boolean?} [isNtx=false] - is new transaction
   * @throws {LedgerError}
   */

  async hashTransactionStart(tx, inputKey, prev, tis = {}, isNtx = false) {
    assert(this.device);

    if (Buffer.isBuffer(tx))
      tx = TX.fromRaw(tx);

    assert(TX.isTX(tx));

    const ntx = tx.clone();

    // nullify other input scripts
    for (const input of ntx.inputs) {
      const pokey = input.prevout.toKey();

      if (pokey === inputKey)
        input.script = prev;
      else
        input.script = NULL_SCRIPT;
    }

    const packets = [APDUCommand.hashTransactionStart(
      utilTX.splitVersionInputs(tx),
      true,
      isNtx
    )];

    for (const input of ntx.inputs) {
      const pokey = input.prevout.toKey();
      let buffer;

      if (!tis[pokey]) {
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
        buffer = bufio.static(2 + tis[pokey].length + scriptVarintSize);

        buffer.writeU8(0x01);
        buffer.writeU8(tis[pokey].length);
        buffer.writeBytes(tis[pokey]);
        buffer.writeVarint(scriptSize);
      }

      packets.push(APDUCommand.hashTransactionStart(
        buffer.render(),
        false,
        isNtx
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
   * @param {MTX|TX|Buffer} tx
   * @param {SignInput[]} signInputs
   * @returns {TX}
   */

  async signTransaction(tx, signInputs) {
    if (Buffer.isBuffer(tx))
      tx = MTX.fromRaw(tx);

    if (TX.isTX(tx) && !MTX.isMTX(tx))
      tx = MTX.fromTX(tx);

    assert(MTX.isMTX(tx), 'Cannot use non-MTX tx for signing');

    const trustedInputs = Object.create(null);
    const txIndexByKey = Object.create(null);

    // Update public keys for keyrings
    for (const si of signInputs) {
      if (!si.publicKey) {
        const hd = await this.getPublicKey(si.path);
        si.publicKey = hd.publicKey;
      }
    }

    // Collect trusted inputs
    for (const si of signInputs) {
      if (si.redeem)
        continue;

      const pokey = si.toKey();
      const trustedInput = await this.getTrustedInput(si.tx, si.index);

      trustedInputs[pokey] = trustedInput;
    }

    // Find indexes in transaction
    for (const [i, input] of tx.inputs.entries()) {
      const pokey = input.prevout.toKey();

      txIndexByKey[pokey] = i;
    }

    let newtx = true;
    for (const si of signInputs) {
      const pokey = si.toKey();
      const index = txIndexByKey[pokey];

      await this.signInput(tx, si, trustedInputs, index, newtx);
      newtx = false;
    }

    return tx;
  }

  /**
   * Sign input
   * @param {MTX} tx
   * @param {SignInput} si
   * @param {Buffer[]} trustedInputs
   * @param {Number} index - Input index in new tx
   * @param {Boolean} newtx - is it new transaction
   * @returns {MTX}
   */

  async signInput(tx, si, trustedInputs, index, isNew = false) {
    const input = tx.inputs[index];
    const pokey = si.toKey();
    const ring = si.getRing(this.network);
    const coin = si.getCoin();

    // Get the previous output's script
    const vector = input.script;
    let prev = coin.script;
    let redeem = false;

    // Grab regular p2sh redeem script.
    if (prev.isScripthash()) {
      prev = si.redeem;
      if (!prev)
        throw new Error('Redeem script not found');
      redeem = true;
    }

    if (redeem)
      trustedInputs = {};

    await this.hashTransactionStart(tx, pokey, prev, trustedInputs, isNew);

    // TODO(node): use returned user validation flags
    await this.hashOutputFinalize(tx);

    const signature = await this.hashSign(tx, si.path, si.type);

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

/**
 * Transactions and outputs
 * to be used for next transaction
 */

class SignInput {
  /**
   * @constructor
   * @param {Object} options
   * @param {String|Number[]} options.path
   * @param {TX|Buffer} options.tx
   * @param {Number} options.index
   * @param {Script?} options.redeem
   * @param {SighashType?} options.type
   * @param {Buffer?} options.publicKey - raw public key for ring
   */

  constructor(options) {
    this.path = [];
    this.tx = null;
    this.index = 0; // Output index
    this.redeem = null;
    this.type = Script.hashType.ALL;
    this.publicKey = null;

    // protected..
    this._ring = null;
    this._coin = null;
    this._key = '';
    this._prev = null;

    this.set(options);
  }

  /**
   * Set options for SignInput
   * @param {Object} options
   */

  set(options) {
    assert(options, 'SignInput data is required.');
    assert(options.path, 'Path is required.');

    if (typeof options.path === 'string')
      options.path = util.parsePath(options.path, true);

    assert(Array.isArray(options.path), 'Path must be Array or string');
    this.path = options.path;

    assert(options.tx, 'Tx is required.');

    if (Buffer.isBuffer(options.tx))
      options.tx = TX.fromRaw(options.tx);

    assert(TX.isTX(options.tx), 'Cannot use non-transaction tx.');
    this.tx = options.tx;

    assert(typeof options.index === 'number', 'Output index is required.');
    assert(isU32(options.index), 'Output index must be a uint32.');
    this.index = options.index;

    if (options.type != null) {
      assert(Script.hashTypeByVal[options.type],
        `Hashtype ${options.type} does not exist`
      );

      this.type = options.type;
    }

    if (options.redeem != null) {
      assert(Script.isScript(options.redeem), 'Cannot use non-script redeem.');
      this.redeem = options.redeem;
    }

    if (options.publicKey != null) {
      assert(Buffer.isBuffer(options.publicKey),
        'Cannot set non-buffer public key');
      this.publicKey = options.publicKey;
    }
  }

  /**
   * Get Key from prevout
   * @returns {String}
   */

  toKey() {
    if (!this._key)
      this._key = Outpoint.fromTX(this.tx, this.index).toKey();

    return this._key;
  }

  /**
   * Get previous script
   * @returns {Script}
   */

  getPrev() {
    if (!this._prev)
      this._prev = this.tx.outputs[this.index].script;

    return this._prev;
  }

  /**
   * Generate and return coin
   * @param {Number?} [height=0]
   * @param {CoinEntry} coin
   */

  getCoin(height = 0) {
    if (!this._coin)
      this._coin = Coin.fromTX(this.tx, this.index, height);

    return this._coin;
  }

  /**
   * Get ring
   * @param {Network} [network=main]
   * @returns {KeyRing}
   */

  getRing(network = Network.primary) {
    if (!this.publicKey)
      throw new LedgerError('Cannot return ring without public key');

    if (!this._ring) {
      this._ring = KeyRing.fromPublic(this.publicKey, network);

      if (this.redeem)
        this._ring.script = this.redeem;
    }

    return this._ring;
  }

  /**
   * Clear the cache
   */

  refresh() {
    this._coin = null;
    this._ring = null;
    this._key = '';
    this._prev = null;
  }
}

/*
 * Helpers
 */

function isU32(value) {
  return (value >>> 0) === value;
}

exports.SignInput = SignInput;
exports.LedgerBcoin = LedgerBcoin;
