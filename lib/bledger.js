/*!
 * bledger.js - Ledger communication
 * Copyright (c) 2017, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const hid = require('./ledgerhid');
const APDU = require('./apdu');
const BTC = require('./btc');
const LedgerError = require('./error');
const LedgerProtocol = require('./ledgerprotocol');

exports.bledger = exports;

exports.hid = hid;
exports.LedgerBTC = BTC;
exports.LedgerProtocol = LedgerProtocol;
exports.LedgerError = LedgerError;

exports.APDU = APDU;
exports.APDUCommand = APDU.APDUCommand;
