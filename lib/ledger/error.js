/*!
 * error.js - Ledger Error
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

/**
 * Ledger Error
 * @extends {Error}
 */

class LedgerError extends Error {
  /**
   * Create a ledger error.
   * @constructor
   * @param {String} reason
   */

  constructor(reason, start) {
    super();

    this.type = 'LedgerError';
    this.message = `${reason}`;

    if (Error.captureStackTrace)
      Error.captureStackTrace(this, start || LedgerError);
  }
}

module.exports = LedgerError;
