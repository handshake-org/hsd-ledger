'use strict';

const fs = require('fs');

module.exports = {
    cert: fs.readFileSync(__dirname + '/certs/cert.pem'),
    key: fs.readFileSync(__dirname + '/certs/key.pem')
};
