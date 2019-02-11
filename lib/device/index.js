/*!
 * device.js - Abstract Ledger Device
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

Device = require('./device');
HID = require('./hid');
U2F = require('./u2f');

exports.Device = Device;
exports.HID = HID;
exports.U2F = U2F;
