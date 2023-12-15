# hsd-ledger

This is a client library for [ledger-app-hns][hns]. It uses primitives
from [hsd][hsd].

## Install
```
$ git clone https://github.com/handshake-org/hsd-ledger.git
$ cd hsd-ledger
$ npm install
```

## Usage

### Node.js Library

When requiring `hsd-ledger` as a dependency in your project, you MUST
also install `hsd`, either globally (`npm i -g hsd`) or require `hsd` as a
sibling dependency along side `hsd-ledger`. This is effectively how
`peerDependencies` worked in npm version 4 through 6, but starting with npm v7,
those dependencies are installed, usually a second time, causing `instanceof`
checks to fail.

There are two ways to use this library to interact with a Ledger device:
- using HID from Node.js
- using WebUSB in the browser

Example usage can be found and run using the following files:
- [examples/getAppVersion.js][app] - Get the application version number.
- [examples/getAccountXPUB.js][acc] - Get a BIP44 account xpub.
- [examples/getXPUB.js][xpub] - Get an arbitrary xpub.
- [examples/getAddress.js][addr] - Get a BIP44 compliant address.
- [examples/getPublicKey.js][pub] - Get a BIP44 compliant address.
- [examples/signTransaction-p2pkh.js][p2pkh] - Sign P2PKH transaction.
- [examples/signTransaction-p2sh.js][p2sh] - Sign P2SH transaction.
- [examples/webusb/index.js][usb] - WebUSB.

### CLI

There is a CLI tool, in the `bin` directory, that can interact with a Ledger
device and an `hsd` full node. The docs are [here][docs].

[app]: ./examples/getAppVersion.js
[acc]: ./examples/getAccountXPUB.js
[xpub]: ./examples/getXPUB.js
[addr]: ./examples/getAddress.js
[pub]: ./examples/getPublicKey.js
[p2pkh]: ./examples/signTransaction-p2pkh.js
[p2sh]: ./examples/signTransaction-p2sh.js
[p2sh]: ./examples/signTransaction-p2sh.js
[usb]: ./examples/webusb/index.js
[docs]: ./docs/cli.md

## Tests
### Unit tests
```bash
$ npm test
```

### End-to-end tests

For all end-to-end tests, a `LOG_LEVEL` environment variable can be set
to control the log output. Possible log levels include: `none`, `info`,
`warning`, `debug`, `error`, `spam`.


>Note: the end-to-end tests require a connected Ledger Nano using the
seed phrase:
```
abandon abandon abandon abandon abandon abandon
abandon abandon abandon abandon abandon about
```

#### Using Ledger Nano
```bash
$ npm run test-hid
```

#### Using Ledger Nano and hsd
```bash
$ npm run test-hsd
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

[hns]: https://github.com/handshake-org/ledger-app-hns
[hsd]: https://github.com/handshake-org/hsd
[bledger]: https://github.com/bcoin-org/bledger
