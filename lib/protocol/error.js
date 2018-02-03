/*!
 * error.js - BLedger Error
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

/**
 * BLedger Error
 * @extends {Error}
 */

class LedgerError extends Error {
  /**
   * Create a bledger error.
   * @constructor
   * @param {String} reason
   */

  constructor(reason, start) {
    super();

    this.type = 'LedgerError';
    this.message = `${reason}.`;

    if (Error.captureStackTrace)
      Error.captureStackTrace(this, start || LedgerError);
  }
}

LedgerError.LedgerError = LedgerError;

module.exports = LedgerError;
