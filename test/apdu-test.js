/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const bufio = require('bufio');
const { Coin, KeyRing, MTX, Script } = require('hsd');

const assert = require('./utils/assert');
const fund = require('./utils/fund');
const {
  APDUCommand,
  APDUReader,
  APDUResponse,
  APDUWriter,
  common
} = require('../lib/apdu');
const util = require('../lib/utils/util');
const LedgerInput = require('../lib/ledger/input');

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

describe('apdu', function () {
  // TODO(boymanjor): add more tests
  describe('apdu.js', () => {
    describe('APDUCommand.getAppVersion()', () => {
      it('should encode commmand', () => {
        const encoded = APDUCommand.getAppVersion();

        assert.strictEqual(encoded.cla, common.cla.GENERAL,
          'wrong cla');
        assert.strictEqual(encoded.ins, common.ins.GET_APP_VERSION,
          'wrong ins');
        assert.strictEqual(encoded.p1, 0x00, 'wrong p1');
        assert.strictEqual(encoded.p2, 0x00, 'wrong p2');
        assert.strictEqual(encoded.data, common.EMPTY, 'wrong data');
      });
    });

    describe('APDUResponse.getAppVersion()', () => {
      it('should decode response', () => {
        const encoded = Buffer.from('0001009000', 'hex');
        const decoded = APDUResponse.getAppVersion(encoded);

        assert.strictEqual(decoded.status, common.status.SUCCESS,
          'wrong status');
        assert.strictEqual(decoded.type, common.ins.GET_APP_VERSION,
          'wrong type');
        assert.strictEqual(decoded.data.version, '0.1.0', 'wrong version');
      });
    });

    describe('APDUCommand.getPublicKey()', () => {
      it('should encode commmand', () => {
        let path = `m/44'/5355'/0'/0/0`;
        let confirm = true;
        let net = 'regtest';
        let xpub = false;
        let addr = false;
        let data = Buffer.from([
          '05',
          '8000002c800014eb800000000000000000000000'
        ].join(''), 'hex');
        let encoded = APDUCommand.getPublicKey(path, confirm, net, xpub, addr);

        assert.strictEqual(encoded.cla, common.cla.GENERAL,
          'cla should be GENERAL');
        assert.strictEqual(encoded.ins, common.ins.GET_PUBLIC_KEY,
          'ins should be GET_PUBLIC_KEY');
        assert.strictEqual(encoded.p1, 0x05, 'wrong p1');
        assert.strictEqual(encoded.p2, 0x00, 'wrong p2');
        assert.deepEqual(encoded.data, data, 'wrong data');
      });
    });

    describe('APDUResponse.getPublicKey()', () => {
      it('should decode response', () => {
        const pub = '03253ea6d6486d1b9cc3ab01a9a321d65' +
                    'c350c6c26a9c536633e2ef36163316bf2';
        const remainder = '0000009000';
        const encoded = Buffer.from(pub + remainder, 'hex');
        const decoded = APDUResponse.getPublicKey(encoded);

        assert.strictEqual(decoded.status, common.status.SUCCESS,
          'wrong status');
        assert.strictEqual(decoded.type, common.ins.GET_PUBLIC_KEY,
          'wrong type');
        assert.deepEqual(decoded.data.publicKey, Buffer.from(pub, 'hex'),
          'wrong publicKey');
        assert.ok(!decoded.data.chainCode, 'wrong chainCode');
        assert.ok(!decoded.data.parentFingerPrint, 'wrong parentFingerPrint');
        assert.ok(!decoded.data.address, 'wrong address');
      });
    });

    describe('APDUCommand.parseTX', () => {
      it('should encode command', () => {
        let first = true;
        let hex = '00000000000000000102587d4f3ed666cf9186aeddc72663df' +
                  '2e1d58b0245a9ae742e6b985d6079445d7730000000010dbf5';
        let data = Buffer.from(hex, 'hex');
        const encoded = APDUCommand.parseTX(data, first);

        assert.strictEqual(encoded.cla, common.cla.GENERAL,
          'cla should be GENERAL');
        assert.strictEqual(encoded.ins, common.ins.GET_INPUT_SIGNATURE,
          'ins should be GET_INPUT_SIGNATURE');
        assert.strictEqual(encoded.p1, 0x01, 'wrong p1');
        assert.strictEqual(encoded.p2, 0x00, 'wrong p2');
        assert.deepEqual(encoded.data, data, 'wrong data');
      });
    });

    describe('APDUResponse.parseTX', () => {
      it('should decode response', () => {
        let encoded = Buffer.from('9000', 'hex');
        let decoded = APDUResponse.parseTX(encoded);

        assert.strictEqual(decoded.status, common.status.SUCCESS,
          'wrong status');
        assert.strictEqual(decoded.type, common.ins.GET_INPUT_SIGNATURE,
          'wrong type');
        assert.deepEqual(decoded.data, {}, 'wrong data');
      });
    });

    describe('APDUCommand.getInputSignature', () => {
      it('should encode command', async () => {
        let hex = '03253ea6d6486d1b9cc3ab01a9a321d65c350c6c26a9c536633e2ef36163316bf2';
        let pub = Buffer.from(hex, 'hex');
        let ring = await KeyRing.fromPublic(pub);
        let addr = ring.getAddress();
        let {coins, txs} = await fund.fundAddress(addr, 1);
        let mtx = new MTX();

        mtx.addOutput({
          address: KeyRing.generate().getAddress(),
          value: 10000000
        });

        await mtx.fund(coins, {
          changeAddress: ring.getAddress(),
          subtractFee: true
        });

        let confirm = true;
        let index = 0;
        let input = new LedgerInput({
          path: `m/44'/5355'/0'/0/0`,
          coin: Coin.fromTX(txs[0], 0, -1),
          publicKey: pub
        });

        let raw = input.getPrevRedeem();
        let bw = bufio.write(raw.getVarSize());
        raw.write(bw);
        let script = bw.render();
        let encoded = APDUCommand.getInputSignature(
          input, index, script, confirm);

        hex = '058000002c800014eb8000000000000000000000000001000000' +
              '1976c014a8d9028425a9740eb82a11001146057a649b474a88ac';
        let data = Buffer.from(hex, 'hex');

        assert.strictEqual(encoded.cla, common.cla.GENERAL,
          'cla should be GENERAL');
        assert.strictEqual(encoded.ins, common.ins.GET_INPUT_SIGNATURE,
          'ins should be GET_INPUT_SIGNATURE');
        assert.strictEqual(encoded.p1, 0x01, 'wrong p1');
        assert.strictEqual(encoded.p2, 0x01, 'wrong p2');
        assert.deepEqual(encoded.data, data, 'wrong data');
      });
    });

    describe('APDUResponse.getInputSignature', () => {
      it('should decode response', () => {
        let encoded = Buffer.from('9000', 'hex');
        let decoded = APDUResponse.getInputSignature(encoded, true);

        assert.strictEqual(decoded.status, common.status.SUCCESS,
          'wrong status');
        assert.strictEqual(decoded.type, common.ins.GET_INPUT_SIGNATURE,
          'wrong type');
        assert.deepEqual(decoded.data, {}, 'wrong data');

        let res = '9000';
        let sig = '317b0972986a0307b7bb13f624a0f5949' +
                  'e656fdc4b0d9b2bb57efb0ce2b050655d' +
                  'b4ec67e327e8a231c606b7aa93a661366' +
                  'b049d208d61a08e336ce2b8dbc65401';

        encoded = Buffer.from(sig + res, 'hex');
        decoded = APDUResponse.getInputSignature(encoded);

        assert.strictEqual(decoded.status, common.status.SUCCESS,
          'wrong status');
        assert.strictEqual(decoded.type, common.ins.GET_INPUT_SIGNATURE,
          'wrong type');
        assert.deepEqual(decoded.data.signature.length, 65, 'wrong data');
        assert.deepEqual(decoded.data.signature, Buffer.from(sig, 'hex'), 'wrong data');
      });
    });
  });

  // TODO(boymanjor): add more tests
  describe('io.js', function () {
    describe('APDUWriter', () => {
      it('should encode binary data', () => {
        for (const test of tests) {
          const writer = new APDUWriter({
            channelID: 0x0101,
            packetSize: 64,
            tag: 0x05,
            data: test.buffer
          });

          const result = writer.toRaw();

          assert.bufferEqual(result, test.expectedBuffer);
        }
      });
    });

    describe('APDUReader', () => {
      it('should decode binary data', () => {
        for (const test of responseTests) {
          const messages = test.messages;
          const messageBuffer = Buffer.concat(messages);

          const decoded = APDUReader.fromMessages(messages);
          const decodedBuffer = APDUReader.fromBuffer(messageBuffer);

          assert.bufferEqual(decoded, test.expectedData);
          assert.bufferEqual(decodedBuffer, test.expectedData);
        }
      });
    });
  });
});
