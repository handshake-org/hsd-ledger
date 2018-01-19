'use strict';

const webpack = require('webpack');
const path = require('path');
const root = path.join(__dirname, '../../');

const vendorManifest = path.join(root, 'build/vendor-manifest.json');
const bledger = path.join(root, 'lib/bledger-browser');

module.exports = {
  target: 'web',
  entry: {
    app: './index.js'
  },
  output: {
    libraryTarget: 'umd',
    path: path.resolve(__dirname),
    filename: '[name].js'
  },
  resolve: {
    modules: ['node_modules'],
    extensions: ['-browser.js', '.js', '.json'],
    alias: {
      bledger: bledger
    }
  },
  plugins: [
    new webpack.DllReferencePlugin({
      manifest: require(vendorManifest),
      name: 'vendor_lib'
    })
  ]
};
