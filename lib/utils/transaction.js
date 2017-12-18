'use strict';

const assert = require('assert');
const bufio = require('bufio');
const {encoding} = bufio;

const TX = require('bcoin/lib/primitives/tx');

/**
 * Size where we break scripts
 * @const {Number}
 * @default
 */

const MAX_SCRIPT_BLOCK = 50;

/**
 * Split buffer to multiple chunks
 * @param {Buffer} data
 * @param {Number} size - chunk size
 * @param {Boolean?} zeroCopy - Don't reallocate buffers
 * @returns {Buffer[]}
 */

exports.splitBuffer = (data, size, zeroCopy = false) => {
    const br = bufio.reader(data, zeroCopy);
    const messages = [];

    while(br.left() > size) {
      messages.push(br.readBytes(size));
    }

    messages.push(br.readBytes(br.left()));

    return messages;
};

/**
 * Split Transaction
 * @param {TX|Buffer} tx
 * @returns {Buffer[]}
 */

exports.splitTransaction = (tx) => {
  if (Buffer.isBuffer(tx))
    tx = TX.fromRaw(tx);

  assert(TX.isTX(tx));

  const buffers = [];

  // send transaction version with inputIndex
  // Sending first message
  {
    const size = 4 + encoding.sizeVarint(tx.inputs.length);
    const message = bufio.static(size);

    message.writeU32(tx.version);
    message.writeVarint(tx.inputs.length);

    buffers.push(message.render());
  }

  // sending inputs
  for (const input of tx.inputs) {
    // send prevout and script varint
    {
      const scriptSize = input.script.getSize();
      const size = 36 + encoding.sizeVarint(scriptSize);
      const message = bufio.static(size);

      input.prevout.toWriter(message);
      message.writeVarint(scriptSize);

      buffers.push(message.render());
    }

    // send scripts
    const rawScript = input.script.toRaw();
    const messages = exports.splitBuffer(rawScript, MAX_SCRIPT_BLOCK, true);

    const lastMessage = messages.pop();

    for (const message of messages)
      buffers.push(message);

    // last script block and sequence
    const last = bufio.static(lastMessage.length + 4);
    last.writeBytes(lastMessage);
    last.writeU32(input.sequence);

    buffers.push(last.render());
  }

  // send outputs length
  {
    const size = encoding.sizeVarint(tx.outputs.length);
    const message = bufio.static(size);

    message.writeVarint(tx.outputs.length);
    buffers.push(message.render());
  }

  // send outputs
  for (const output of tx.outputs) {
    const size = output.getSize();
    const message = bufio.static(size);

    output.toWriter(message);

    buffers.push(message.render());
  }

  // send locktime
  {
    const message = bufio.static(4);
    message.writeU32(tx.locktime);

    buffers.push(message.render());
  }

  return buffers;
};
