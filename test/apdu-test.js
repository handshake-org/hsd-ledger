/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('./util/assert');
const LedgerError = require('../lib/error');
const APDU = require('../lib/apdu');
const {APDUResponse} = APDU;
const {APDUError} = APDU;

describe('APDU', function () {
  it('should decode PUBLIC_KEY response', () => {
    const pubkeyResponse = Buffer.from(
      '41042d4eaa0351d491c928b8d295079927abc4c4' +
      'c595d98d5f30d8acf8e7476b2c68e0ab3f929bbe' +
      'bb13e181ffc8a133a4aa87c2568d537a3c923f63' +
      'e8df1f4d5fdc2231384369334339377a6a313772' +
      '38586d773843665536517351724c5042476a5567' +
      '76b6ab28942fd09759fe7270ac84d5d8747c5020' +
      '66254596e69deaec01b2662bea9000', 'hex');

    const response = APDUResponse.getPublicKey(pubkeyResponse);

    assert.strictEqual(response.status, 0x9000);
    assert.strictEqual(response.type, APDU.INS.PUBLIC_KEY);
  });

  it('should decode PUBLIC_KEY error response', () => {
    const code = 0x6f02;
    const hexCode = '6f02';
    const pubkeyResponse = Buffer.from(hexCode, 'hex');

    try {
      APDUResponse.getPublicKey(pubkeyResponse);
    } catch (e) {
      if (!(e instanceof APDUError))
        throw e;

      assert(e instanceof APDUError);
      assert(e instanceof LedgerError);
      assert.strictEqual(e.code, code);
      assert.strictEqual(e.hexCode, hexCode);
      assert.strictEqual(e.message, 'Internal error. (0x6f02)');
    }
  });
});
