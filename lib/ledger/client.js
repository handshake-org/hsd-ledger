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
const {MTX, Network, Rules} = require('hsd');
const {types} = Rules;

const util = require('../utils/util');
const {APDUCommand, APDUResponse, common} = require('../apdu');
const {Device} = require('../device/device');
const LedgerChange = require('./change');
const LedgerError = require('./error');

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
   * @param {Object?} options
   * @param {LedgerCovenant[]?} options.covenants - Ledger-aware covenants
   * @param {LedgerChange?} options.change - Ledger-aware change outputs
   * @throws {LedgerError}
   */

  async parseTX(mtx, options) {
    assert(this.device);
    assert(MTX.isMTX(mtx), 'mtx must be instanceof MTX');

    let covenants, change;

    if (options != null) {
      if (options.covenants != null) {
        assert(Array.isArray(options.covenants),
          'options.covenants must be an Array');
        covenants = options.covenants;
      }

      if (options.change != null) {
        assert(options.change instanceof LedgerChange,
          'options.change must be instanceof LedgerChange');
        change = options.change;
      }
    }

    let size = 0;

    size += 8; // version + locktime
    size += encoding.sizeVarint(mtx.inputs.length);
    size += encoding.sizeVarint(mtx.outputs.length);
    size += 1; // change flag

    if (change != null)
      size += change.getSize();

    for (const input of mtx.inputs) {
      size += input.getSize();
      size += 8;  // value
    }

    let outs = 0;

    for (let i = 0; i < mtx.outputs.length; i++) {
      let msg;
      const output = mtx.outputs[i];
      const type = output.covenant.type;
      outs += output.getSize();

      switch(type) {
        case types.NONE:
        case types.OPEN:
        case types.BID:
        case types.FINALIZE:
          continue;

        case types.REVEAL:
        case types.REDEEM:
        case types.REGISTER:
        case types.UPDATE:
        case types.RENEW:
        case types.TRANSFER:
        case types.REVOKE: {
          let found = false;
          msg = `Must provide name for output #${i}.`;

          if (!covenants)
            throw new LedgerError(msg);

          for (const covenant of covenants) {
            if (i === covenant.getIndex()) {
              found = true;
              outs += covenant.getSize();
            }
          }

          if (!found)
            throw new LedgerError(msg);

          break;
        }

        default: {
          msg = `Unsupported covenant type: ${type}`;
          throw new LedgerError(msg);
        }
      }
    }

    size += outs;

    const buf = bufio.write(size);

    buf.writeU32(mtx.version);
    buf.writeU32(mtx.locktime);
    buf.writeU8(mtx.inputs.length);
    buf.writeU8(mtx.outputs.length);

    if (change != null) {
      buf.writeU8(0x01); // change flag
      change.write(buf);
    } else {
      buf.writeU8(0x00); // change flag
    }

    for (const input of mtx.inputs) {
      const coin = mtx.view.getCoinFor(input);
      input.prevout.write(buf);
      buf.writeU32(input.sequence);
      buf.writeU64(coin.value);
    }

    for (let i = 0; i < mtx.outputs.length; i++) {
      const output = mtx.outputs[i];
      const type = output.covenant.type;
      output.write(buf);

      switch(type) {
        case types.REVEAL:
        case types.REDEEM:
        case types.REGISTER:
        case types.UPDATE:
        case types.RENEW:
        case types.TRANSFER:
        case types.REVOKE:
          // We've already verified that the
          // covenants array exists, and that
          // the names have been provided.
          for (const covenant of covenants)
            if (i === covenant.getIndex())
              covenant.write(buf);
          break;

        default:
          continue;
      }
    }

    const packets = APDUCommand.parseTX(buf.render(), {
      network: this.network.type
    });

    for (let packet of packets) {
      let res = await this.device.exchange(packet.toRaw());
      let {data} = APDUResponse.parseTX(res);

      // ledger-app-hns has limited access to RAM.
      // Instead of storing outputs in memory, the
      // output details are parsed and immediately
      // displayed on screen for output verification.
      //
      // Because the tx details are sent in size based
      // packets, the end of an output is probably not
      // the end of a packet. In this common case,
      // ledger-app-hns will send the remaining packet
      // bytes back to the client. This code handles
      // parsing those bytes.
      while (data.length) {
        const net = common.network[this.network.type];
        const cla = common.cla.GENERAL;
        const ins = common.ins.GET_INPUT_SIGNATURE;
        const p2 = 0x00;
        let p1 = 0x00;

        if(net != null)
          p1 = net;

        packet = new APDUCommand({cla, ins, p1, p2, data});
        res = await this.device.exchange(packet.toRaw());
        ({data} = APDUResponse.parseTX(res));
      }
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
