'use strict';

const webpack = require('webpack');
const path = require('path');

const vendorManifest = path.join(
  __dirname,
  '../build',
  'vendor-manifest.json'
);

module.exports = {
  mode: 'development',
  target: 'web',
  entry: {
    hns-ledger: './lib/hns-ledger'
  },
  output: {
    libraryTarget: 'umd',
    path: path.resolve(__dirname, '../build'),
    filename: '[name].js'
  },
  resolve: {
    modules: ['node_modules'],
    extensions: ['-browser.js', '.js', '.json']
  },
  plugins: [
    new webpack.DllReferencePlugin({
      manifest: require(vendorManifest),
      name: 'vendor_lib'
    })
  ]
};
