'use strict';
/* eslint-env browser */

const bledger = require('bledger');
const {LedgerBcoin} = bledger;
const {Device} = bledger.U2F;

const KeyRing = require('bcoin/lib/primitives/keyring');

const NETWORK = 'regtest';
const XPUBS = 1;
const ADDRESSES = 4;
const CHANGE = true;

(async () => {
  const device = new Device({
    scrambleKey: 'btc',
    timeout: 5000
  });

  await device.open();

  const ledgerBcoin = new LedgerBcoin({
    device: device
  });

  const xpubs = {};

  for (let i = 0; i < XPUBS; i++) {
    const path = `m/44'/0'/${i}'`;

    xpubs[path] = await getPublicKey(ledgerBcoin, path);
  }

  for (const key of Object.keys(xpubs)) {
    const xpub = xpubs[key];

    console.log(`Account: ${key} addresses:`);
    for (let i = 0; i < ADDRESSES; i++) {
      const address = deriveAddress(xpub, 0, i, NETWORK);

      console.log(`  /0/${i}: ${address}`);

      if (CHANGE) {
        const change = deriveAddress(xpub, 1, i, NETWORK);
        console.log(`  /1/${i}: ${change}\n`);
      }
    }
  }

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function getPublicKey(btcApp, path) {
  return await btcApp.getPublicKey(path);
}

function deriveAddress(hd, change, index, network) {
  const pubkey = hd.derive(change).derive(index);
  const keyring = KeyRing.fromPublic(pubkey.publicKey, network);

  return keyring.getAddress().toString();
}
/**/
