/*!
 * hsd-ledger.js - Ledger communication
 * Copyright (c) 2018, The Handshake Developers (MIT License).
 * https://github.com/handshake-org/hsd
 */

'use strict';

const USB = require('./device/usb');
const WebAuthn = require('./device/webauthn');
const DeviceError = require('./device/error');
const LedgerError = require('./ledger/error');
const LedgerHSD = require('./ledger/hsd');
const LedgerInput = require('./ledger/input');

exports.USB = USB;
exports.WebAuthn = WebAuthn;
exports.DeviceError = DeviceError;
exports.LedgerError = LedgerError;
exports.LedgerHSD = LedgerHSD;
exports.LedgerInput = LedgerInput;
