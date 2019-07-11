/*!
 * client.js - internal client for ledger-app-hns
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * Copyright (c) 2018, Boyma Fahnbulleh (MIT License).
 * https://github.com/boymanjor/hsd-ledger
 */

'use strict';

const assert = require('bsert');
const bufio = require('bufio');
const {encoding} = bufio;
const {MTX, Network} = require('hsd');

const util = require('../utils/util');
const {APDUCommand, APDUResponse} = require('../apdu');
const {Device} = require('../device/device');

/**
 * Ledger client interface for ledger-app-hns methods.
 * @see https://github.com/boymanjor/ledger-app-hns
 */

class LedgerClient {
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
   * @param {Object} options
   * @param {Number} options.confirm - true for on-device confirmation
   * @param {Boolean} options.xpub - true to return xpub details
   * @param {Boolean} options.address - true to return address
   * @returns {Object} data
   * @returns {Buffer} data.publicKey
   * @returns {Buffer|undefined} data.chainCode
   * @returns {Number|undefined} data.parentFingerPrint
   * @returns {String|undefined} data.address
   * @throws {LedgerError}
   */

  async getPublicKey(path, options) {
    assert(this.device);

    if (typeof path === 'string')
      path = util.parsePath(path, true);

    assert(Array.isArray(path), 'path must be a String or Array');

    if (!options)
      options = Object.create(null);

    options.network = this.network.type;

    const cmd = APDUCommand.getPublicKey(path, options);
    const buf = await this.device.exchange(cmd.toRaw());
    const res = APDUResponse.getPublicKey(buf);

    return res.data;
  }

  /**
   * Send the transaction details to the Ledger device to begin
   * signature hash.
   * @async
   * @param {hsd.MTX} mtx - mutable transaction
   * @throws {LedgerError}
   */

  async parseTX(mtx) {
    assert(this.device);
    assert(MTX.isMTX(mtx), 'mtx must be instanceof MTX');

    let size = 0;

    size += 8; // version + locktime
    size += encoding.sizeVarint(mtx.inputs.length);
    size += encoding.sizeVarint(mtx.outputs.length);

    for (const input of mtx.inputs) {
      size += 4;  // sequence
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
      input.prevout.write(buf);
      buf.writeU32(input.sequence);
    }

    for (const output of mtx.outputs) {
      buf.writeU64(output.value);
      output.address.write(buf);
      output.covenant.write(buf);
    }

    const packets = APDUCommand.parseTX(buf.render());

    for (const packet of packets) {
      const res = await this.device.exchange(packet.toRaw());
      APDUResponse.parseTX(res);
    }
  }

  /**
   * Send a signature request to the Ledger device for the specified input.
   * @async
   * @param {LedgerInput} ledgerInput - Ledger aware input
   * @returns {Object} data
   * @returns {Buffer} data.signature
   * @throws {LedgerError}
   */

  async getInputSignature(ledgerInput, output) {
    assert(this.device);
    assert(ledgerInput);

    let size = 0;

    const path = encodePath(ledgerInput.path);
    const hsdInput = ledgerInput.input;
    size += path.length + hsdInput.getSize() + 12; // value + sighash type

    // Create varbytes input script.
    const raw = ledgerInput.getPrevRedeem();
    const bw = bufio.write(raw.getVarSize());
    raw.write(bw);
    const script = bw.render();
    size += script.length;

    let outsz = 0;

    if (output) {
      outsz += 8; // value
      outsz += output.address.getSize();
      outsz += output.covenant.getVarSize();
      size += encoding.sizeVarint(outsz);
      size += outsz;
    } else {
      size += 1;
    }

    // Create main data buffer.
    const buf = bufio.write(size);
    buf.writeBytes(path);
    buf.writeU32(ledgerInput.type);
    hsdInput.prevout.write(buf);
    buf.writeU64(ledgerInput.coin.value);
    buf.writeU32(hsdInput.sequence);
    buf.writeBytes(script);

    if (output) {
      buf.writeVarint(outsz);
      buf.writeU64(output.value);
      output.address.write(buf);
      output.covenant.write(buf);
    } else {
      buf.writeU8(0);
    }

    // Create and send command packets.
    const packets = APDUCommand.getInputSignature(buf.render());

    for (let i = 0; i < packets.length-1; i++) {
      const packet = packets[i];
      const result = await this.device.exchange(packet.toRaw());
      APDUResponse.getInputSignature(result, true);
    }

    // Create and send last command packet and retrieve signature.
    const packet = packets[packets.length-1];
    const result = await this.device.exchange(packet.toRaw());
    const {data} = APDUResponse.getInputSignature(result);
    return data;
  }
}

/**
 * Helpers
 */

function encodePath(path) {
  if (typeof path === 'string') {
    path = util.parsePath(path, true);
  }

  const parts = path;
  const bw = bufio.write(1 + parts.length * 4);

  bw.writeU8(parts.length);

  for (const index of parts) {
    bw.writeU32BE(index);
  }

  return bw.render();
};

module.exports = LedgerClient;
