/*!
 * bledger.js - Ledger communication
 * Copyright (c) 2017, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const hid = require('./ledgerhid');
const APDU = require('./apdu');
const Bcoin = require('./bcoin');
const BTC = require('./btc');
const LedgerError = require('./error');
const LedgerProtocol = require('./ledgerprotocol');

exports.bledger = exports;

exports.hid = hid;
exports.LedgerProtocol = LedgerProtocol;
exports.LedgerError = LedgerError;
exports.LedgerBcoin = Bcoin;
exports.LedgerBTC = BTC;

exports.APDU = APDU;
exports.APDUCommand = APDU.APDUCommand;
