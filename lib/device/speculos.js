'use strict';

const net = require('chrome-net');

class USB {
  constructor() {}

  static getDevices() {
    return [new exports.USBDevice()];
  }

  static requestDevice() {
    return new exports.USBDevice();
  }
}

class USBDevice {
  constructor() {
    this.vendorId = 0x2c97;
    this.opened = false;
    this.configuration = {};
    this.socket;
    this.host = '127.0.0.1';
    this.port = 9999;
    this.buffer = [];
    this.left = 0;
  }

  open() {
    this.opened = true;
    this.socket = net.connect(
      this.port,
      this.host
    );

    this.socket.on('data', (data) => {
      this.parseData(data);
    });
  }

  close() {
    this.socket.destroy();
    this.opened = false;
  }

 parseData(data) {
    function prefix(data, sequence) {
      let inserted = 3;
      if (sequence > 0)
        inserted += 2;

      const prefixed = Buffer.alloc(inserted + data.length);

      // Prefix the CHANNEL_ID and TAG_APDU
      prefixed[0] = 0x01;
      prefixed[1] = 0x01;
      prefixed[2] = 0x05;
      data.copy(prefixed, inserted);

      if (sequence > 0)
        prefixed.writeUInt16BE(sequence, 3);

      return prefixed;
    }

    // Bump packet size to include status message because
    // Speculos decrements it for some reason:
    // https://github.com/LedgerHQ/speculos/blob/
    //   dce04843ad7d4edbcd399391b3c39d30b37de3cd/mcu/apdu.py#L81
    let size = data.readUInt16BE(2);
    size += 2;
    data.writeUInt16BE(size, 2);

    // Client expects chunks of 64 bytes
    let sequence = 0;
    while (data.length > 0) {
      data = prefix(data, sequence++);
      this.buffer.push(data.slice(0, 64));
      data = data.slice(64);
    }
  }

  async transferOut(endpointNumber, data) {
    // Trim CHANNEL_ID (0x0101) and TAG_APDU (0x05)
    data = data.slice(3);

    // Remove non-zero sequence values after first chunk since Speculos
    // only expects a 4-byte size
    const sequence = data.readUInt16BE(0);
    if (sequence > 0)
      data = data.slice(2);

    return this.socket.write(data);
  }

  async transferIn(endpointNumber, packetSize) {
    // Message has already arrived, return it.
    if (this.buffer.length > 0) {
      return {
        status: 'ok',
        data: {buffer: this.buffer.shift()}
      };
    }

    // Otherwise, wait.
    return new Promise((resolve, reject) => {
      this.socket.once('data', (data) => {
        resolve({
          status: 'ok',
          data: {buffer: this.buffer.shift()}
        });
      });
    });
  }

  reset() {}
  claimInterface() {}
  selectConfiguration() {}
  releaseInterface() {}
}

class USBConfiguration {}
class USBInterface {}
class USBAlternateInterface {}
class USBEndpoint {}

exports.usb = USB;
exports.USB = USB;
exports.USBDevice = USBDevice;
exports.USBConfiguration = USBConfiguration;
exports.USBInterface = USBInterface;
exports.USBAlternativeInterface = USBAlternateInterface;
exports.USBEndpoint = USBEndpoint;
