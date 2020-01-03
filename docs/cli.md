# How to use Ledger Nano S with Handshake

The [hsd-ledger][repo] client library includes a CLI application that can
connect to an [HSD][hsd] wallet/node server and the Ledger Handshake app.
This CLI app allows users to manage accounts, view HNS balances, create HNS
addresses, and send HNS. Any addresses created with the app must be verified
on-device. All transactions are signed on the Ledger Nano S and require
on-device verification as well.

The CLI app requires Node.js v8.0.0+, access to HSD wallet and node servers,
and access to a Ledger Nano S running the latest firmware version.

## Before you begin

Before you begin this tutorial, be sure:
- You have initialized your Ledger Nano S
- Your Ledger Nano S is running the latest firmware
- You have installed Ledger Live
- Ledger Live is open and ready to use

## Install the Handshake app on Ledger Nano S

1. Open the Manager in Ledger Live.
2. Connect and unlock your Ledger Nano S.
3. If asked, allow the manager on your device by pressing the right button.
4. Find Handshake in the app catalog.
5. Click the Install button of the app.
6. An installation window appears.
7. Your device will display Processing…
8. The app installation is confirmed.

## Download and install the HSD Ledger CLI app

Follow the instructions [here][install] to download and install the CLI app.
Once the CLI app is installed, unlock your Ledger Nano S and open the
Handshake app. Also make sure you have access to a running HSD node.
For instructions on setting up an HSD node, please see the official
[documentation][docs].

## General Notes

The CLI app embeds node and wallet clients for HSD. By default, the app will
try to connect to HSD node and wallet servers running on localhost using the
[default ports][config]. Users may specify custom locations for the node and
wallet servers by using flags [below](#usage). The CLI app defaults to using
the testnet. This can also be configured using a flag specified
[below](#usage).

For more information on configuring clients for connection to HSD, please see
the official documentation [here][config]. The flags supported by the HSD
Ledger CLI app are [below](#usage).

<a href="#first"></a>Upon its first run, the CLI app will create a watch-only
wallet using `hsd-ledger` as its wallet-id. This wallet acts as the default
wallet for the app. Any commands that do not specify an alternative wallet will
use this wallet. Alternative wallets can be created and specified using commands
found [below](#usage). The XPUB at HD path `M/44'/5354'/0'` (default account
for testnet) will be used to create an account with the account-name `default`.
Any commands that do not specify an alternative account will use this account.
You may use this account or create new accounts within this wallet, or other
wallets found on your HSD node.

## General Usage

This section highlights the general usage of the CLI app.

```bash
usage:
  $ hsd-ledger createwallet <wallet-id>
  $ hsd-ledger createaccount <account-name> <account-index>
  $ hsd-ledger createaddress
  $ hsd-ledger sendtoaddress <address> <amount>
  $ hsd-ledger getwallets
  $ hsd-ledger getaccounts
  $ hsd-ledger getaccount <account-name>
  $ hsd-ledger getbalance
  $ hsd-ledger getairdropaddress

options:
  --help
  --version
  -n, --network <id> (default "testnet")
  -w, --wallet-id <id> (default "hsd-ledger")
  -a, --account-name <name> (default "default")
  -i, --account-index <index> (default 0)

The following options configure the node and wallet clients:
  --ssl
  --url <url>
  --api-key <api-key>
  --host <host> (default "localhost")

The following options configure the node client only:
  --node-ssl
  --node-url <url>
  --node-api-key <api-key>
  --node-host <host> (default "localhost")
  --node-port <port> (default 14037)

The following options configure the wallet client only:
  --wallet-ssl
  --wallet-url <url>
  --wallet-api-key <api-key>
  --wallet-host <host> (default "localhost")
  --wallet-port <port> (default 14039)

The following options are for the getairdropaddress command:
  --project-sponsor (encrypts address for project sponsors)
  --qrcode (generates a QR encoded address)
  --show-key (show address public key)
```

## Tutorial

This tutorial will walk through a sequence of commands to familiarize you with
the HSD Ledger CLI app's functionality. Before you start, make sure you are
running an HSD node on regtest using the default ports.

### Prerequisites

To download, install, and start HSD run:

```bash
$ git clone https://github.com/handshake-org/hsd.git
$ cd hsd
$ npm install --production
$ ./bin/hsd -n regtest
```

From a separate terminal window, download and install hsd-ledger:

```bash
$ git clone https://github.com/boymanjor/hsd-ledger.git
$ cd hsd-ledger
$ npm install
```

Make sure you have your Ledger Nano S connected and unlocked.
Also, make sure that you have the Handshake app open.

### Wallets and Accounts

As mentioned [earlier](#first), the CLI app will generate a default wallet
and account for you using the XPUB at HD path `M/44'/5355'/0'`, where `5355'`
is the cointype for the `regtest` network.

#### View wallets

To view the wallets on your HSD node run:

```bash
$ ./bin/hsd-ledger getwallets -n regtest
```

>Note: `-n regtest` specifies that we are using the regtest network.

If you started a fresh instance of HSD, you will notice there are two wallets
shown: `["primary", "hsd-ledger"]`. The "primary" wallet was generated by HSD
upon startup. However, it does not contain keys from you Ledger Nano S and
should not be used with the HSD Ledger CLI app. By default, all commands will
use the "hsd-ledger" wallet.

#### View accounts

To list the accounts in your default wallet run:

```bash
$ ./bin/hsd-ledger getaccounts -n regtest
```

You should see the "default" account listed.

#### Create an account

It is possible to create a new account using a different XPUB from your Ledger
Nano S. To create a new account named "second" using the XPUB at account
index `M/44'/5355'/1'`run:

```bash
$ ./bin/hsd-ledger createaccount second 1 -n regtest
```

>Note: the HSD Ledger CLI app enforces hardened derivation.

You should now see the "default" & "second" accounts listed when running:

```bash
$ ./bin/hsd-ledger getaccounts -n regtest
```

#### View balance

To view the HNS balance of the "default" account run:

```bash
$ ./bin/hsd-ledger getbalance -n regtest
```

The account should be empty.

#### Create an address

We can fund the account with regtest coins by mining some blocks using a
coinbase address from this account. To create an address run:

```bash
$ ./bin/hsd-ledger createaddress -n regtest
```

You will be asked to verify that the address shown in the terminal matches the
address shown on your Ledger Nano S.

#### Fund your account

Once you have generated an address, copy the address into your clipboard.
Next navigate to the root of the hsd source code directory and run:

```bash
$ ./bin/cli rpc generatetoaddress 1 <address> -n regtest
```

The above will generate a regtest block and send the coinbase reward to the
address you generated in the previous step. We need to bypass the coinbase
maturity period so the coins are spendable. Run the following command to
generate a couple of more blocks:

```bash
$ ./bin/cli rpc generate 2 -n regtest
```

To confirm your updated balance, navigate back to the root of the hsd-ledger
source code directory and run:

```bash
$ ./bin/hsd-ledger getbalance -n regtest
```

### HNS Transactions

Now we are ready to send a transaction that is signed by your Ledger Nano S.
Let's send some coins from the "default" account to the "second" account.
First, we need to generate a receiving address for the "second" account.
To generate a new address run:

```bash
$ ./bin/hsd-ledger createaddress -n regtest -a second
```

Now we can send HNS to this new address from the "default" account by running:

```bash
$ ./bin/hsd-ledger sendtoaddress <address> <amount> -n regtest
```

>Note: `<address>` is the address generated in the previous command and
`<amount>` is the amount of dollarydoos, e.g. 5000000 _not_ 5 HNS.

You will be asked to verify that the transaction details shown in the terminal
matches the details shown on your Ledger Nano S. If you reject any of the details,
the transaction will not be signed or sent to the network.

Once you verify the transaction details, you can mine a block on your HSD node
and check that the balances of the "default" and "second" accounts have been updated.

Congrats! You have signed a valid transaction using your Ledger Nano S.

## Final Notes

If you encounter any issue with your Ledger device and the CLI binary,
please open an issue on the GitHub [repo][issues].

[repo]: https://github.com/boymanjor/hsd-ledger
[hsd]: https://github.com/handshake-org/hsd
[install]: https://github.com/boymanjor/hsd-ledger/blob/master/README.md#install
[issues]: https://github.com/boymanjor/hsd-ledger/issues
[docs]: https://handshake-org.github.io/
[config]: https://handshake-org.github.io/api-docs/index.html#configuring-clients
