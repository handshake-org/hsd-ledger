'use strict';

const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const path = require('path');

module.exports = {
  mode: 'production',
  target: 'web',
  entry: {
    hns-ledger: './lib/hns-ledger'
  },
  output: {
    library: 'hns-ledger',
    libraryTarget: 'umd',
    path: path.join(__dirname, '..', 'build'),
    filename: '[name].js'
  },
  resolve: {
    modules: ['node_modules'],
    extensions: ['-browser.js', '.js', '.json']
  },
  plugins: [
    new UglifyJsPlugin()
  ]
};
