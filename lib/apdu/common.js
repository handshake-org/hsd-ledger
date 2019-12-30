/*!
 * common.js - apdu constants for hsd-ledger.
 * Copyright (c) 2018, The Bcoin Developers (MIT License).
 * Copyright (c) 2018, Boyma Fahnbulleh (MIT License).
 * https://github.com/boymanjor/hsd-ledger
 */

'use strict';

const assert = require('bsert');
const util = require('../utils/util');

const common = exports;

/**
 * Channel ID
 * @const {Number}
 * @default
 */
common.CHANNEL_ID = 0x0101;

/**
 * Command TAG for APDU messages
 * @const {Number}
 * @default
 */
common.TAG_APDU = 0x05;

/**
 * Command TAG for Ping
 * @const {Number}
 */
common.TAG_PING = 0x02;

/**
 * Maximum packet size
 * @const {Number}
 * @default
 */
common.MAX_BYTES = 64;

/*
 * Constants
 */

common.EMPTY = Buffer.alloc(0);

/**
 * Maximum depth of HD Path
 * @const {Number}
 */

common.MAX_DEPTH = 10;

/**
 * Network bit flags
 * @const {Object}
 */

common.network = {
  'main': 0x00,
  'testnet': 0x02,
  'regtest': 0x04,
  'simnet': 0x06
};

/**
 * Get network bit flag.
 * @param {String} network
 */

common.getNetworkFlag = function(network) {
  const networks = Object.keys(common.network);
  assert(typeof network === 'string', 'Network must be a String.');
  assert(networks.includes(network), 'Unknown network.');
  return common.network[network];
};

/**
 * Instruction classes
 * @const {Object}
 */

common.cla = {
  GENERAL: 0xe0,
  VENDOR: 0xd0
};

common.claByVal = util.reverse(common.cla);

/**
 * Instruction code
 * @const {Object}
 */

common.ins = {
  GET_APP_VERSION: 0x40,
  GET_PUBLIC_KEY: 0x42,
  GET_INPUT_SIGNATURE: 0x44
};

common.insByVal = util.reverse(common.ins);

/**
 * Response status codes
 * @const {Object}
 */

common.status = {
  CACHE_FLUSH_ERROR: 0x6f27,
  CACHE_WRITE_ERROR: 0x6f26,
  CANNOT_CREATE_COVENANT_NAME_HASH: 0x6f36,
  CANNOT_ENCODE_ADDRESS: 0x6f14,
  CANNOT_ENCODE_XPUB: 0x6f23,
  CANNOT_INIT_BLAKE2B_CTX: 0x6f13,
  CANNOT_PEEK_SCRIPT_LEN: 0x6f1e,
  CANNOT_READ_ADDR_VERSION: 0x6f30,
  CANNOT_READ_BIP32_PATH: 0x6f15,
  CANNOT_READ_CHANGE_ADDR_FLAG: 0x6f2d,
  CANNOT_READ_CHANGE_OUTPUT_INDEX: 0x6f2f,
  CANNOT_READ_COVENANT_ITEMS_LEN: 0x6f32,
  CANNOT_READ_INPUT_INDEX: 0x6f1b,
  CANNOT_READ_INPUT_VALUE: 0x6f2b,
  CANNOT_READ_INPUTS_LEN: 0x6f18,
  CANNOT_READ_OUTPUTS_LEN: 0x6f19,
  CANNOT_READ_OUTPUTS_SIZE: 0x6f1a,
  CANNOT_READ_PREVOUT: 0x6f2a,
  CANNOT_READ_RESOURCE_LEN: 0x6f35,
  CANNOT_READ_SCRIPT_LEN: 0x6f1d,
  CANNOT_READ_SEQUENCE: 0x6f2c,
  CANNOT_READ_SIGHASH_TYPE: 0x6f1c,
  CANNOT_READ_TX_VERSION: 0x6f16,
  CANNOT_READ_TX_LOCKTIME: 0x6f17,
  CANNOT_UPDATE_UI: 0x6f28,
  CHANGE_ADDRESS_MISMATCH: 0x6f38,
  CLA_NOT_SUPPORTED: 0x6e00,
  CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
  COVENANT_NAME_HASH_MISMATCH: 0x6f37,
  FAILED_TO_SIGN_INPUT: 0x6f29,
  FILE_NOT_FOUND: 0x6a82,
  INCORRECT_ADDR_PATH: 0x6f25,
  INCORRECT_CDATA: 0x6a80,
  INCORRECT_CHANGE_ADDR_FLAG: 0x6f2e,
  INCORRECT_INPUT_INDEX: 0x6f1F,
  INCORRECT_LENGTH: 0x6701,
  INCORRECT_LC: 0x6700,
  INCORRECT_NAME_LEN: 0x6f33,
  INCORRECT_P1: 0x6af1,
  INCORRECT_P2: 0x6af2,
  INCORRECT_PARAMETERS: 0x6b00,
  INCORRECT_PARSER_STATE: 0x6f21,
  INCORRECT_SIGHASH_TYPE: 0x6f20,
  INCORRECT_SIGNATURE_PATH: 0x6f22,
  INCORRECT_INPUTS_LEN: 0x6f24,
  INTERNAL_ERROR: 0x6f,
  INS_NOT_SUPPORTED: 0x6d00,
  SECURITY_CONDITION_NOT_SATISFIED: 0x6982,
  SUCCESS: 0x9000,
  UNSUPPORTED_COVENANT_TYPE: 0x6f31,
  UNSUPPORTED_SIGHASH_TYPE: 0x6f34
};

/**
 * Error messages
 * @const {Object}
 */

common.errorByStatus = {
  CACHE_FLUSH_ERROR: 'Error flushing internal cache',
  CACHE_WRITE_ERROR: 'Error writing to internal cache',
  CANNOT_CREATE_COVENANT_NAME_HASH: 'Cannot create name hash',
  CANNOT_ENCODE_ADDRESS: 'Cannot bech32 encode address',
  CANNOT_ENCODE_XPUB: 'Cannot base58 encode xpub',
  CANNOT_INIT_BLAKE2B_CTX: 'Cannot initialize blake2b context',
  CANNOT_PEEK_SCRIPT_LEN: 'Cannot peek input script length',
  CANNOT_READ_ADDR_VERSION: 'Cannot read address version',
  CANNOT_READ_BIP32_PATH: 'Cannot read BIP32 path',
  CANNOT_READ_CHANGE_ADDR_FLAG: 'Cannot read change address flag',
  CANNOT_READ_CHANGE_OUTPUT_INDEX: 'Cannot read change output flag',
  CANNOT_READ_COVENANT_ITEMS_LEN: 'Cannot read length of covenant items',
  CANNOT_READ_INPUT_INDEX: 'Cannot read index of input',
  CANNOT_READ_INPUT_VALUE: 'Cannot read input value',
  CANNOT_READ_INPUTS_LEN: 'Cannot read input vector length',
  CANNOT_READ_PREVOUT: 'Cannot read input prevout',
  CANNOT_READ_OUTPUTS_LEN: 'Cannot read output vector length',
  CANNOT_READ_OUTPUTS_SIZE: 'Cannot read size of outputs vector',
  CANNOT_READ_RESOURCE_LEN: 'Cannot read name resource length',
  CANNOT_READ_SCRIPT_LEN: 'Cannot read input script length',
  CANNOT_READ_SEQUENCE: 'Cannot read input sequence',
  CANNOT_READ_SIGHASH_TYPE: 'Cannot read sighash type',
  CANNOT_READ_TX_VERSION: 'Cannot read tx version',
  CANNOT_READ_TX_LOCKTIME: 'Cannot read tx locktime',
  CANNOT_UPDATE_UI: 'Cannot update Ledger UI',
  CHANGE_ADDRESS_MISMATCH: 'Change derivation path does not match address',
  CLA_NOT_SUPPORTED: 'Instruction not supported (check app on the device)',
  CONDITIONS_OF_USE_NOT_SATISFIED: 'User rejected on-screen confirmation',
  COVENANT_NAME_HASH_MISMATCH: 'Covenant name does not match hash',
  FAILED_TO_SIGN_INPUT: 'Failed to sign input',
  FILE_NOT_FOUND: 'File not found',
  INCORRECT_ADDR_PATH: 'Incorrect BIP44 address path',
  INCORRECT_CDATA: 'Incorrect CDATA (command data)',
  INCORRECT_CHANGE_ADDR_FLAG: 'Incorrect change address flag',
  INCORRECT_INPUT_INDEX: 'Input index larger than inputs vector length',
  INCORRECT_INPUTS_LEN: 'Inputs vector length is larger than device limit',
  INCORRECT_LENGTH: 'Incorrect length',
  INCORRECT_LC: 'Incorrect LC (length of command data)',
  INCORRECT_NAME_LEN: 'Incorrect name length',
  INCORRECT_P1: 'Incorrect P1',
  INCORRECT_P2: 'Incorrect P2',
  INCORRECT_PARAMETERS: 'Incorrect parameters (P1 or P2)',
  INCORRECT_PARSER_STATE: 'Incorrect parser state',
  INCORRECT_SIGHASH_TYPE: 'Incorrect sighash type',
  INCORRECT_SIGNATURE_PATH: 'Incorrect signature path',
  INS_NOT_SUPPORTED: 'Instruction not supported (check app on the device)',
  INTERNAL_ERROR:'Internal error',
  SECURITY_CONDITION_NOT_SATISFIED: 'Invalid security status',
  UNKNOWN_ERROR: 'Unknown status code',
  UNSUPPORTED_COVENANT_TYPE: 'Unsupported covenant type',
  UNSUPPORTED_SIGHASH_TYPE: 'Unsupported sighash type'
};

/**
 * Status word messages by value
 * @const {Object}
 */

common.statusByVal = util.reverse(common.status);
