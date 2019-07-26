'use strict';
/* eslint-env browser */

const {LedgerHSD, WebAuthn} = require('../../lib/hsd-ledger-browser');
const {Device} = WebAuthn;
const KeyRing = require('hsd/lib/primitives/keyring');

const NETWORK = 'regtest';
const XPUBS = 1;
const ADDRESSES = 4;
const CHANGE = true;

const device = new Device({
  timeout: 20000
});

(async () => {
  await device.open();

  const ledger = new LedgerHSD({ device });
  const xpubs = {};

  for (let i = 0; i < XPUBS; i++) {
    const path = `m/44'/0'/${i}'`;
    xpubs[path] = await ledger.getPublicKey(path);
  }

  for (const key of Object.keys(xpubs)) {
    console.log(`Account: ${key} addresses:`);

    const xpub = xpubs[key];

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
})();

function deriveAddress(hd, change, index, network) {
  const pubkey = hd.derive(change).derive(index);
  const keyring = KeyRing.fromPublic(pubkey.publicKey, network);
  return keyring.getAddress().toString();
}
