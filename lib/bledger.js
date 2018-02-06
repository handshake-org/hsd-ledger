/*!
 * bledger.js - Ledger communication
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const LedgerError = require('./protocol/error');
const LedgerBcoin = require('./bcoin');
const LedgerTXInput = require('./txinput');
const HID = require('./devices/ledgerhid');

exports.bledger = exports;

exports.HID = HID;
exports.LedgerError = LedgerError;

exports.LedgerBcoin = LedgerBcoin;
exports.LedgerTXInput = LedgerTXInput;
