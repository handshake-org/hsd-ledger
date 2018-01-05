/*!
 * bledger.js - Ledger communication
 * Copyright (c) 2017, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const hid = require('./ledgerhid');

const APDU = require('./apdu');
const LedgerError = require('./error');
const LedgerProtocol = require('./ledgerprotocol');

const BTC = require('./btc');
const LedgerBcoin = require('./bcoin');
const LedgerTXInput = require('./txinput');

exports.bledger = exports;

exports.hid = hid;
exports.LedgerProtocol = LedgerProtocol;
exports.LedgerError = LedgerError;

exports.LedgerBcoin = LedgerBcoin;
exports.LedgerTXInput = LedgerTXInput;

exports.LedgerBTC = BTC;

exports.APDU = APDU;
exports.APDUCommand = APDU.APDUCommand;
