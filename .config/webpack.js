'use strict';

const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const path = require('path');

module.exports = {
  target: 'web',
  entry: {
    bledger: './lib/bledger'
  },
  output: {
    library: 'bledger',
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
