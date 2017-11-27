/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('./util/assert');
const LedgerProtocol = require('../lib/ledgerprotocol');
const {ProtocolWriter} = LedgerProtocol;
const {ProtocolReader} = LedgerProtocol;

const tests = [
  {
    buffer: Buffer.from('1234'),
    expectedBuffer: Buffer.from('0101050000000431323334', 'hex')
  }, {
    buffer: Buffer.alloc(57),
    expectedBuffer: Buffer.from(
      '0101050000003900000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '00000000', 'hex')
  }, {
    buffer: Buffer.alloc(58),
    expectedBuffer: Buffer.from(
      '0101050000003a00000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '00000000010105000100', 'hex')
  }, {
    buffer: Buffer.alloc(115),
    expectedBuffer: Buffer.from(
      '0101050000007300000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000001010500010000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '00000000000000', 'hex')
  }, {
    buffer: Buffer.alloc(116),
    expectedBuffer: Buffer.from(
      '0101050000007400000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000001010500010000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000', 'hex')
  }, {
    buffer: Buffer.alloc(117),
    expectedBuffer: Buffer.from(
      '0101050000007500000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000001010500010000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000010105000200', 'hex')
  }, {
    buffer: Buffer.alloc(200),
    expectedBuffer: Buffer.from(
      '010105000000c800000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000001010500010000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000010105000200000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '0000000000000000000000000101050003000000' +
      '0000000000000000000000000000000000000000' +
      '0000', 'hex')
  }
];

const responseTests = [{
  messages: [
    Buffer.from('010105000000053132333434', 'hex')
  ],
  expectedData: Buffer.from('3132333434', 'hex')
}, {
  messages: [
    Buffer.from(
    '0101050000003900000000000000000000000000' +
    '0000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000' +
    '00000000', 'hex')
  ],
  expectedData: Buffer.from(
    '0000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000', 'hex')
}, {
  messages: [
    Buffer.from(
      '0101050000008741042d4eaa0351d491c928b8d2' +
      '95079927abc4c4c595d98d5f30d8acf8e7476b2c' +
      '68e0ab3f929bbebb13e181ffc8a133a4aa87c256' +
      '8d537a3c', 'hex'),
    Buffer.from(
      '0101050001923f63e8df1f4d5fdc223138436933' +
      '4339377a6a31377238586d773843665536517351' +
      '724c5042476a556776b6ab28942fd09759fe7270' +
      'ac84d5d8', 'hex'),
    Buffer.from(
      '0101050002747c502066254596e69deaec01b266' +
      '2bea900000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000' +
      '00000000', 'hex')
  ],
  expectedData: Buffer.from(
    '41042d4eaa0351d491c928b8d295079927abc4c4' +
    'c595d98d5f30d8acf8e7476b2c68e0ab3f929bbe' +
    'bb13e181ffc8a133a4aa87c2568d537a3c923f63' +
    'e8df1f4d5fdc2231384369334339377a6a313772' +
    '38586d773843665536517351724c5042476a5567' +
    '76b6ab28942fd09759fe7270ac84d5d8747c5020' +
    '66254596e69deaec01b2662bea9000', 'hex')
}];

describe('Ledger Protocol', function () {
  it('should encode binary data', () => {
    for (const test of tests) {
      const ledgerProtocol = new ProtocolWriter({
        channelID: 0x0101,
        packetSize: 64,
        tag: 0x05,
        data: test.buffer
      });

      const result = ledgerProtocol.toRaw();

      assert.bufferEqual(result, test.expectedBuffer);
    }
  });

  it('should decode binary data', () => {
    for (const test of responseTests) {
      const messages = test.messages;
      const messageBuffer = Buffer.concat(messages);

      const decoded = ProtocolReader.fromMessages(messages);
      const decodedBuffer = ProtocolReader.fromBuffer(messageBuffer);

      assert.bufferEqual(decoded, test.expectedData);
      assert.bufferEqual(decodedBuffer, test.expectedData);
    }
  });

  it('should split buffer to messages', () => {
    for (const test of responseTests) {
      const buf = Buffer.concat(test.messages);
      const messages = ProtocolReader.splitBuffer(buf, 64);

      for (let i = 0; i < messages.length; i++) {
        assert.bufferEqual(messages[i], test.messages[i]);
      }
    }
  });
});
