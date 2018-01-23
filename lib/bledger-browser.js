/*!
 * bledger-browser.js - Ledger communication for browser
 * Copyright (c) 2017, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const APDU = require('./apdu');
const LedgerError = require('./error');
const LedgerProtocol = require('./ledgerprotocol');

const BTC = require('./btc');
const LedgerBcoin = require('./bcoin');
const LedgerTXInput = require('./txinput');
const U2F = require('./u2f');

exports.bledger = exports;

exports.U2F = U2F;
exports.LedgerProtocol = LedgerProtocol;
exports.LedgerError = LedgerError;

exports.LedgerBcoin = LedgerBcoin;
exports.LedgerTXInput = LedgerTXInput;

exports.LedgerBTC = BTC;

exports.APDU = APDU;
exports.APDUCommand = APDU.APDUCommand;

