/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const util = require('../lib/utils/util');

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

describe('utils', function () {
  describe('util.js', () => {
    describe('harden()', () => {
      it('should harden BIP44 index', () => {
        const index = 1;

        const got = util.harden(index);
        const want = 0x80000001;
        assert.strictEqual(got, want);
      });
    });

    describe('reverse()', () => {
      it('should create new object with keys and vals reversed', () => {
        const had = { a: 'first', b: 'second', c: 'third'};

        let got = util.reverse(had);
        let want = { 'first': 'a', 'second': 'b', 'third': 'c'};
        assert.deepEqual(got, want, 'wrong object');

        got = had.a;
        want = 'first';
        assert.strictEqual(got, want, 'mutated original object');
      });
    });

    describe('splitBuffer()', () => {
      it('should split buffer to messages', () => {
        for (const test of responseTests) {
          const buf = Buffer.concat(test.messages);
          const messages = util.splitBuffer(buf, 64);

          for (let i = 0; i < messages.length; i++) {
            const got = messages[i];
            const want = test.messages[i];
            assert.bufferEqual(got, want, 'buffers not equal');
          }
        }
      });
    });
  });
});
