/*!
 * hsd-ledger-browser.js - Ledger communication
 * Copyright (c) 2018, The Handshake Developers (MIT License).
 * https://github.com/handshake-org/hsd
 */

'use strict';

const util = require('./utils/util');
const USB = require('./device/usb-browser');
const DeviceError = require('./device/error');
const LedgerError = require('./ledger/error');
const LedgerHSD = require('./ledger/hsd');
const LedgerInput = require('./ledger/input');
const LedgerChange = require('./ledger/change');
const LedgerCovenant = require('./ledger/covenant');

exports.util = util;
exports.USB = USB;
exports.DeviceError = DeviceError;
exports.LedgerError = LedgerError;
exports.LedgerHSD = LedgerHSD;
exports.LedgerInput = LedgerInput;
exports.LedgerChange = LedgerChange;
exports.LedgerCovenant = LedgerCovenant;
