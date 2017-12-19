'use strict';

const EMPTY = Buffer.alloc(0);

exports.getCommands = (file) => {
  if (file[0] !== '/') {
    file = '../' + file;
  }

  const data = require(file);

  return {
    data,
    tx: data.tx ? Buffer.from(data.tx, 'hex') : EMPTY,
    commands: data.commands.map(c => Buffer.from(c, 'hex')),
    responses: data.responses.map(r => Buffer.from(r, 'hex'))
  };
};
