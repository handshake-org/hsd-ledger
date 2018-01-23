'use strict';

const webpack = require('webpack');
const path = require('path');

const vendorManifest = path.join(
  __dirname,
  '../build',
  '[name]-manifest.json'
);

module.exports = {
  target: 'web',
  entry: {
    vendor: ['bcoin/lib/bcoin-browser', 'bufio', 'bmutex', 'bcrypto', 'u2f-api']
  },
  output: {
    libraryTarget: 'umd',
    path: path.join(__dirname, '../build'),
    library: '[name]_lib',
    filename: 'vendor.js'
  },
  resolve: {
    modules: ['node_modules'],
    extensions: ['-browser.js', '.js', '.json']
  },
  plugins: [
    new webpack.DllPlugin({
      name: '[name]_lib',
      path: vendorManifest
    })
  ]
};
