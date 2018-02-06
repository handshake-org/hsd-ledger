/*!
 * bledger-browser.js - Ledger communication for browser
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const LedgerError = require('./protocol/error');
const LedgerBcoin = require('./bcoin');
const LedgerTXInput = require('./txinput');
const U2F = require('./devices/u2f');

exports.bledger = exports;

exports.U2F = U2F;
exports.LedgerError = LedgerError;

exports.LedgerBcoin = LedgerBcoin;
exports.LedgerTXInput = LedgerTXInput;
