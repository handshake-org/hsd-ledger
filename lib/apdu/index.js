/*!
 * protocol/index.js - Ledger protocol
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const APDU = require('./apdu');
const common = require('./common');
const io = require('./io');

exports.APDU = APDU;
exports.APDUError = APDU.Error;
exports.APDUCommand = APDU.Command;
exports.APDUReader = io.Reader;
exports.APDUResponse = APDU.Response;
exports.APDUWriter = io.Writer;
exports.common = common;
