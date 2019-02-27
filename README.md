# hns-ledger

This is a client library for [ledger-app-hns][hns]. It uses primitives
from [hsd][hsd].

## Usage

Currently, we only support Node.js. We have plans to support browser
usage through WebUSB. Example usage can be found and run using the
following files:

- [examples/getAppVersion.js][app] - Get the application version number.
- [examples/getAccountXPUB.js][acc] - Get a BIP44 account xpub.
- [examples/getXPUB.js][xpub] - Get an arbitrary xpub.
- [examples/getAddress.js][addr] - Get a BIP44 compliant address.
- [examples/getPublicKey.js][pub] - Get a BIP44 compliant address.
- [examples/signTransaction-p2pkh.js][p2pkh] - Sign P2PKH transaction.
- [examples/signTransaction-p2sh.js][p2sh] - Sign P2SH transaction.

[app]: ./examples/getAppVersion.js
[acc]: ./examples/getAccountXPUB.js
[xpub]: ./examples/getXPUB.js
[addr]: ./examples/getAddress.js
[pub]: ./examples/getPublicKey.js
[p2pkh]: ./examples/signTransaction-p2pkh.js
[p2sh]: ./examples/signTransaction-p2sh.js

>Note: `hsd` is a peer dependency.

More documentation to come...

## Tests

For unit tests run:
```bash
$ npm test
```

For end to end tests using a Ledger device run:
```bash
$ npm run test-hid
```

The device tests expect a wallet using the seed phrase:
```
abandon abandon abandon abandon
abandon abandon abandon abandon
abandon abandon abandon about
```

For end to end tests using a Ledger device and an `hsd` full node run:
```bash
$ npm run test-hsd
```

The end to end tests expect a wallet using the seed phrase:
```
abandon abandon abandon abandon
abandon abandon abandon abandon
abandon abandon abandon about
```

## Contribution and License Agreement

If you contribute code to this project, you are implicitly allowing your code
to be distributed under the MIT license. You are also implicitly verifying that
all code is your original work. `</legalese>`

## License

- Copyright (c) 2018, Boyma Fahnbulleh (MIT License).

This project is a fork of [bledger][bledger].

### bledger

- Copyright (c) 2018, The Bcoin Developers (MIT License).

See LICENSE for more info.

[hns]: https://github.com/boymanjor/ledger-app-hns
[hsd]: https://github.com/handshake-org/hsd
[bledger]: https://github.com/bcoin-org/bledger
