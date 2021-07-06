/*!
 * hsd-ledger.js - Ledger communication
 * Copyright (c) 2018, The Handshake Developers (MIT License).
 * https://github.com/handshake-org/hsd
 */

'use strict';

const hsdLedger = exports;

/**
 * Define a module for lazy loading.
 * @param {String} name
 * @param {String} path
 */

hsdLedger.define = function define(name, path) {
  let cache = null;
  Object.defineProperty(hsdLedger, name, {
    get() {
      if (!cache)
        cache = require(path);
      return cache;
    }
  });
};

hsdLedger.define('util', './utils/util');
hsdLedger.define('USB', './device/usb');
hsdLedger.define('HID', './device/hid');
hsdLedger.define('DeviceError', './device/error');
hsdLedger.define('LedgerError', './ledger/error');
hsdLedger.define('LedgerHSD', './ledger/hsd');
hsdLedger.define('LedgerInput', './ledger/input');
hsdLedger.define('LedgerChange', './ledger/change');
hsdLedger.define('LedgerCovenant', './ledger/covenant');
