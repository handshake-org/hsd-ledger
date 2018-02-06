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
  PUBLIC_KEY: 'getPublicKey',
  GET_TRUSTED_INPUT: 'getTrustedInput'
};

const INSNames = Object.keys(methodByINS);

describe('APDU', function () {
  it('should decode PUBLIC_KEY response', () => {
    const pubkeyResponse = Buffer.from(
      '41042d4eaa0351d491c928b8d295079927abc4c4'
      + 'c595d98d5f30d8acf8e7476b2c68e0ab3f929bbe'
      + 'bb13e181ffc8a133a4aa87c2568d537a3c923f63'
      + 'e8df1f4d5fdc2231384369334339377a6a313772'
      + '38586d773843665536517351724c5042476a5567'
      + '76b6ab28942fd09759fe7270ac84d5d8747c5020'
      + '66254596e69deaec01b2662bea9000', 'hex');

    const response = APDUResponse.getPublicKey(pubkeyResponse);

    assert.strictEqual(response.status, APDU.STATUS_WORDS.SUCCESS);
    assert.strictEqual(response.type, APDU.INS.PUBLIC_KEY);
  });

  it('should encode PUBLIC_KEY addressFlags', () => {
    const path = 'm/44\'/0\'/0\'/0/0';
    const flagTests = [{
      name: 'no verification',
      addressFlags: 0,

      // expected p1, p2
      p1: 0,
      p2: 0
    }, {
      name: 'legacy',
      addressFlags: addressFlags.VERIFY | addressFlags.LEGACY,

      // expected
      p1: 1,
      p2: 0
    }, {
      name: 'witness',
      addressFlags: addressFlags.VERIFY | addressFlags.WITNESS,

      // expected
      p1: 1,
      p2: 2
    }, {
      name: 'nested witness',
      addressFlags: addressFlags.VERIFY | addressFlags.NESTED_WITNESS,

      // expected
      p1: 1,
      p2: 1
    }];

    for (const flagTest of flagTests) {
      const command = APDUCommand.getPublicKey(path, flagTest.addressFlags);

      assert.strictEqual(command.p1, flagTest.p1,
        `P1 for ${flagTest.name} is not correct`
      );
      assert.strictEqual(command.p2, flagTest.p2,
        `P2 for ${flagTest.name} is not correct`
      );
    }
  });

  it('should encode GET_TRUSTED_INPUT first message', () => {
    const data = Buffer.from('ffff', 'hex');
    const command = APDUCommand.getTrustedInput(data, true);

    assert.instanceOf(command, APDUCommand);
    assert.strictEqual(command.p1, 0x00);
    assert.strictEqual(command.cla, APDU.CLA.GENERAL);
    assert.strictEqual(command.ins, APDU.INS.GET_TRUSTED_INPUT);
    assert.strictEqual(command.data, data);
  });

  it('should encode GET_TRUSTED_INPUT message', () => {
    const data = Buffer.from('ffff', 'hex');
    const command = APDUCommand.getTrustedInput(data, false);

    assert.instanceOf(command, APDUCommand);
    assert.strictEqual(command.p1, 0x80);
    assert.strictEqual(command.cla, APDU.CLA.GENERAL);
    assert.strictEqual(command.ins, APDU.INS.GET_TRUSTED_INPUT);
    assert.strictEqual(command.data, data);
  });

  it('should decode GET_TRUSTED_INPUT intermediate responses', () => {
    const continueResponse = Buffer.from('9000','hex');

    const response = APDUResponse.getTrustedInput(continueResponse);

    assert.instanceOf(response, APDUResponse);
    assert.strictEqual(response.status, APDU.STATUS_WORDS.SUCCESS);
    assert.strictEqual(response.type, APDU.INS.GET_TRUSTED_INPUT);
    assert.strictEqual(response.data.length, 0);
  });

  it('should decode GET_TRUSTED_INPUT final response', () => {
    const finalResponse = Buffer.from(
      '3200b32b1674edca60ce7863a3bbf04fdaad83aa'
      + '9bbbd90d57f269134aca8bedae5355b601000000'
      + '005ed0b200000000a726e3482a6e18909000', 'hex');

    const response = APDUResponse.getTrustedInput(finalResponse);

    assert.strictEqual(response.status, APDU.STATUS_WORDS.SUCCESS);
    assert.strictEqual(response.type, APDU.INS.GET_TRUSTED_INPUT);
    assert.strictEqual(response.data.length, 56);
    assert.bufferEqual(response.data, finalResponse.slice(0, -2));
  });

  for (const type of INSNames) {
    it(`should decode ${type} error response`, () => {
      const code = 0x6f02;
      const hexCode = '6f02';
      const errorResponse = Buffer.from(hexCode, 'hex');

      try {
        APDUResponse[methodByINS[type]](errorResponse);
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
  }
});
