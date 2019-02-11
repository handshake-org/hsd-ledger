/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('./util/assert');
const LedgerProtocol = require('../lib/protocol');
const {APDU, LedgerError} = LedgerProtocol;
const {APDUCommand} = LedgerProtocol;
const {APDUResponse} = LedgerProtocol;
const {APDUError} = LedgerProtocol;
const {addressFlags} = APDU;

const methodByINS = {
  GET_APP_VERSION: 'getAppVersion',
  GET_PUBLIC_KEY: 'getPublicKey',
  GET_INPUT_SIGNATURE: 'getInputSignature'
};

const INSNames = Object.keys(methodByINS);

describe('APDU', function () {
  it('should decode GET_APP_VERSION response', () => {
    const encoded = Buffer.from('0001009000', 'hex');
    const decoded = APDUResponse.getAppVersion(encoded);

    assert.strictEqual(decoded.status, APDU.status.SUCCESS,
      'status should be SUCCESS');
    assert.strictEqual(decoded.type, APDU.ins.GET_APP_VERSION,
      'type should be GET_PUBLIC_KEY');
    assert.strictEqual(decoded.data.version, '0.1.0');
  });
});
