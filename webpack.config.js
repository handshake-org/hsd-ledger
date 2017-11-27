'use strict';

const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const path = require('path');

module.exports = {
  target: 'web',
  entry: {
    'bledger': './lib/bledger'
  },
  output: {
    library: 'bledger',
    libraryTarget: 'umd',
    path: path.resolve(__dirname, 'build'),
    filename: '[name].js'
  },
  resolve: {
    modules: ['node_modules'],
    extensions: ['-browser.js', '.js', '.json']
  },
  module: {
    rules: [{
      test: /\.js$/,
      loader: 'babel-loader'
    }]
  },
  plugins: [
    new UglifyJsPlugin()
  ]
};

