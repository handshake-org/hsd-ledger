/*!
 * ledger.js - Ledger interface for ledger-app-hns
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * Copyright (c) 2018, Boyma Fahnbulleh (MIT License).
 * https://github.com/boymanjor/hns-ledger
 */

'use strict';

const assert = require('bsert');
const bufio = require('bufio');
const {encoding} = bufio;
const Script = require('hsd/lib/script').Script;
const MTX = require('hsd/lib/primitives/mtx');
const Network = require('hsd/lib/protocol/network');

const {Device} = require('../device/device');
const LedgerProtocol = require('../protocol');
const {APDU, APDUCommand, APDUResponse} = LedgerProtocol;
const util = require('../utils/util');

/**
 * Ledger interface for ledger-app-hns methods.
 * @see https://github.com/boymanjor/ledger-app-hns
 */

class Ledger {
  /**
   * Create ledger app.
   * @constructor
   * @param {Device} device
   */

  constructor(options) {
    assert(options.device instanceof Device);
    assert(options.network instanceof Network);
    this.device = options.device;
    this.network = options.network;
  }

  /**
   * Get app version.
   * @async
   * @returns {Object} data
   * @returns {String} data.version
   * @throws {LedgerError}
   */

  async getAppVersion() {
    assert(this.device);

    const cmd = APDUCommand.getAppVersion();
    const buf = await this.device.exchange(cmd.toRaw());
    const res = APDUResponse.getAppVersion(buf);

    return res.data;
  }

  /**
   * Get public key from specified path.
   *
   * @async
   * @param {(Number[]|String)} path - full derivation path
   * @param {Number} confirm - indicates on-device confirmation
   * @param {Boolean} xpub - true to return xpub details
   * @param {Boolean} address - true to return address
   * @returns {Object} data
   * @returns {hsd.HDPublicKey} data.xpub
   * @returns {hsd.Address} data.address
   * @throws {LedgerError}
   */

  async getPublicKey(path, confirm, xpub, address) {
    assert(this.device);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    assert(Array.isArray(path), 'path must be a String or Array');

    const net = this.network.type;
    const cmd = APDUCommand.getPublicKey(path, confirm, net, xpub, address);
    const buf = await this.device.exchange(cmd.toRaw());
    const res = APDUResponse.getPublicKey(buf);

    return res.data;
  }

  /**
   * Send the transaction details to the Ledger device to begin
   * signature hash.
   * @async
   * @param {hsd.MTX} mtx - mutable transaction
   * @param {Map} ledgerInputByKey - Ledger aware inputs by outpoint keys
   * @throws {LedgerError}
   */

  async parseTX(mtx, ledgerInputByKey) {
    assert(this.device);
    assert(MTX.isMTX(mtx), 'mtx must be instanceof MTX');
    assert(ledgerInputByKey instanceof Map, 'ledgerInputByKey must be instanceof Map');

    let size = 0;

    size += 8; // version + locktime
    size += encoding.sizeVarint(mtx.inputs.length);
    size += encoding.sizeVarint(mtx.outputs.length);

    for (const input of mtx.inputs) {
      size += 4;  // sequence
      size += 8;  // value
      size += input.prevout.getSize();
    }

    let outs = 0;

    for (const output of mtx.outputs) {
      outs += 8;  // value
      outs += output.address.getSize();
      outs += output.covenant.getVarSize();
    }

    size += encoding.sizeVarint(outs);
    size += outs;

    const buf = bufio.write(size);

    buf.writeU32(mtx.version);
    buf.writeU32(mtx.locktime);
    buf.writeVarint(mtx.inputs.length);
    buf.writeVarint(mtx.outputs.length);
    buf.writeVarint(outs);

    for (const input of mtx.inputs) {
      const key = input.prevout.toKey().toString('hex');
      const ledgerInput = ledgerInputByKey.get(key);

      assert(ledgerInput);

      input.prevout.write(buf);
      buf.writeU64(ledgerInput.coin.value);
      buf.writeU32(input.sequence);
    }

    for (const output of mtx.outputs) {
      buf.writeU64(output.value);
      output.address.write(buf);
      output.covenant.write(buf);
    }

    let msgs = util.splitBuffer(buf.render(), util.MAX_SCRIPT_BLOCK);
    let fst = msgs.shift();
    let packet = APDUCommand.parseTX(fst, true);
    let res = await this.device.exchange(packet.toRaw());

    APDUResponse.parseTX(res);

    for (const msg of msgs) {
      const packet = APDUCommand.parseTX(msg, false);
      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.parseTX(res);
    }
  }

  /**
   * Send a signature request to the Ledger device for the specified input.
   * @async
   * @param {String|Numbers[]} path
   * @param {hsd.TX} tx
   * @param {hsd.Script.SighashType} type
   * @returns {Buffer} signed hash
   * @throws {LedgerError}
   */

  // TODO(boymanjor): clean up the logic
  async getInputSignature(input, index, confirm = true) {
    assert(this.device);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    const raw = input.getPrevRedeem();
    const bw = bufio.write(raw.getVarSize());

    raw.write(bw);

    const script = bw.render();
    const msgs = util.splitBuffer(script, util.MAX_SCRIPT_BLOCK, true);
    const first = msgs.shift();

    let packet = APDUCommand.getInputSignature(input, index, first, confirm);
    let res = await this.device.exchange(packet.toRaw());

    if (msgs.length == 0) {
      const { data } = APDUResponse.getInputSignature(res);
      const sig = Buffer.alloc(65);

      data.copy(sig, 0, 0, 64);
      sig[64] = input.type;

      return sig;
    }

    APDUResponse.getInputSignature(res, true);

    const last = msgs.pop();

    for (const msg of msgs) {
      const packet = APDUCommand.getInputSignature(null, null, msg, confirm);
      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.getInputSignature(res, true);
    }

    packet = APDUCommand.getInputSignature(null, null, last, confirm);
    res = await this.device.exchange(packet.toRaw());

    const { data } = APDUResponse.getInputSignature(res);
    const sig = Buffer.alloc(65);

    data.copy(sig, 0, 0, 64);
    sig[64] = input.type;

    return sig;
  }
}

Ledger.params = APDU.params;

module.exports = Ledger;
