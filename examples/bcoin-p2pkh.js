'use strict';

const bledger = require('../lib/bledger');
const {LedgerBcoin, LedgerTXInput} = bledger;
const {Device} = bledger.hid;
const MTX = require('bcoin/lib/primitives/mtx');

(async () => {
  const devices = await Device.getDevices();

  const device = new Device({
    device: devices[0],
    timeout: 5000
  });

  await device.open();

  const ledgerBcoin = new LedgerBcoin({
    device: device
  });

  const tx = Buffer.from(
      '0100000003ae29b8f0086276bb51a4abe8c107cfa44500b'
    + 'bd824f15a1beb86a0d72b27b1d00100000000ffffffff1a0315868'
    + 'daab16de904de31821e5e3ed683a4d5b4b299ae62ab416571c85ff'
    + '50000000000ffffffff6481cf32f63febafbce71e3802a2c139bec'
    + 'e8964eb3789202a5d7d892c582d4d0000000000ffffffff02601ce'
    + '011000000001976a9145e579a42b98e046e65de2b41b227f7072a3'
    + '6a32488ac00000000000000000f6a0d48656c6c6f20626c6564676'
    + '57200000000', 'hex');

  const inputs = [
    {
      tx: Buffer.from(
          '01000000011674edca60ce7863a3bbf04fdaad83aa9bbbd90d'
        + '57f269134aca8bedae5355b6010000006b483045022100d039'
        + '36b5856d76952243535793476b60d83223a111167bec2db983'
        + '68008dd21e0220313d824bc7cd470066423aabc91aad5bacd3'
        + '9205eb4cf5038916311d1e0159fb012103e98a09a729418ed0'
        + 'cd56c01559e3f317a522b3f24027cc455ea2bc09759567e4ff'
        + 'ffffff0280e641ac000000001976a914431321a30e44eaaf87'
        + 'bcc0fd134852bf73b0a52388ac00e1f505000000001976a914'
        + 'efd047c8d895b76cbdcd84a798695e76a0fdb3e488ac000000'
        + '00', 'hex'),
      index: 1,
      path: 'm/44\'/0\'/0\'/1/0'
    }, {
      tx: Buffer.from(
          '01000000010578b91737c81322628b211fd9507083f9251a9d'
        + 'e3882d188866a560f94a6c07000000006b483045022100adbf'
        + '82d96bb743a74eb3331392caed2fd457e3e0599d511e220e17'
        + 'bf698575fe02200f4eeb7bdbb797a2f788de1bd5a434d1fd61'
        + 'b250332fefb22095ea6cdb8a0e9a012102cce90d5a8a0a37c2'
        + 'df09b5fea38d546b0ba58ce7099ea8127721bea333da6a2aff'
        + 'ffffff0200e1f505000000001976a9143028112a4d60e84316'
        + '9fa0113d02a8c9425cdf8e88ac44060d8f000000001976a914'
        + '160d0d2de728f7129a26a09c5d9d48e000a220e188ac000000'
        + '00', 'hex'),
      index: 0,
      path: 'm/44\'/0\'/0\'/0/1'
    }, {
      tx: Buffer.from(
        '0100000001ae29b8f0086276bb51a4abe8c107cfa44500bbd8'
        + '24f15a1beb86a0d72b27b1d0000000006a47304402200c3111'
        + 'b71a92677cc6bce922d3e18ea3a983bb4c398ae2fed1fd1b04'
        + '6d7019f10220371f900279de78f6da5db06afbaad74fbac6be'
        + '2b264ec79ffea39459edf6f0a80121024519c790d3add67179'
        + 'ff9f14e45117e4cbed5924f13ae0c5ca17b856795c1439ffff'
        + 'ffff0200e1f505000000001976a9143028112a4d60e843169f'
        + 'a0113d02a8c9425cdf8e88acc4f34ba6000000001976a914fc'
        + '8b01674ecc8cc2314a27f3c224926af36df11788ac00000000', 'hex'),
      index: 0,
      path: 'm/44\'/0\'/0\'/0/1'
    }
  ];

  const ledgerInputs = inputs.map(i => new LedgerTXInput(i));

  const mtx = MTX.fromRaw(tx, 'hex');

  await ledgerBcoin.signTransaction(mtx, ledgerInputs);

  console.log(mtx.toRaw().toString('hex'));

  await device.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
