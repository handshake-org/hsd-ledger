'use strict';

// configs for certs
const httpsOptions = require('./tlsconf')

// Use production version
const webpackConfigs = require('./webpack');

module.exports = function(config) {
  config.set({

    // Project configurations
    basePath: '..',
    frameworks: ['mocha'],
    files: [
      'test/devices/u2f-test.js' // u2f
    ],
    exclude: [],
    preprocessors: {
      'test/devices/u2f-test.js': ['webpack']
    },
    webpack: webpackConfigs,

    // Karma configs
    plugins: [
      require('karma-webpack'),
      require('karma-mocha'),
      require('karma-mocha-reporter'),
      require('karma-chrome-launcher')
    ],

    // web server configurations
    // use TLS for u2f
    port: 9876,
    protocol: 'https:',
    httpsServerOptions: httpsOptions,

    // Disable Certificate checks
    browsers: ['Chrome_NoCerts'],
    customLaunchers: {
      Chrome_NoCerts: {
        base: 'Chrome',
        flags: ['--ignore-certificate-errors']
      }
    },

    // Karma run configs
    autoWatch: false,
    singleRun: true,
    concurrency: 1,

    // Karma reporting
    reporters: ['mocha'],
    colors: true,
    logLevel: config.LOG_INFO
  });
};
