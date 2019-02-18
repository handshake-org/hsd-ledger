'use strict';

const MTX = require('hsd/lib/primitives/mtx');
const HD = require('hsd/lib/hd');
const Outpoint = require('hsd/lib/primitives/outpoint');
const Coin = require('hsd/lib/primitives/coin');
const KeyRing = require('hsd/lib/primitives/keyring');
const Script = require('hsd/lib/script').Script;

/*
 * It will fund 1 hns from Coinbase
 * @param {Address} addr
 * @param {Number} inputs - Number of inputs we want to genarate
 * @returns {Object} - keys { txList, coinList }
 */
exports.fundAddressCoinbase = function (addr, inputs) {
  const txs = [];
  const coins = [];

  for (let i = 0; i < inputs; i++) {
    const cb = new MTX();

    cb.addInput({
      prevout: new Outpoint(),
      script: new Script()
    });

    cb.addOutput({
      address: addr,
      value: 100000000 + i
    });

    txs.push(cb);
    coins.push(Coin.fromTX(cb, 0, -1));
  }

  return {
    txs,
    coins
  };
};

/*
 * It will fund 1 hns for each input
 * @param {Address} addr
 * @param {Number} inputs - Number of inputs we want to generate
 * @returns {Object} - keys {txList, coinList}
 */

exports.fundAddress = async (addr, inputs) => {
  const cbAddr = KeyRing.generate().getAddress();
  const fundCoinbase = exports.fundAddressCoinbase(cbAddr, inputs);
  const cbCoins = fundCoinbase.coins;
  const keyring = KeyRing.generate();

  const txs = [];
  const coins = [];

  for (let i = 0; i < inputs; i++) {
    const mtx = new MTX();

    mtx.addOutput({
      address: addr,
      value: 100000000 + i
    });

    await mtx.fund([cbCoins[i]], {
      subtractFee: true,
      changeAddress: cbAddr
    });

    mtx.sign(keyring);

    txs.push(mtx);
    coins.push(Coin.fromTX(mtx, 0, -1));
  }

  return {
    txs,
    coins
  };
};
