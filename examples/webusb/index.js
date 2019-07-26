'use strict';

/* eslint-env browser */

const assert = require('bsert');
const {LedgerHSD, WebUSB} = require('../../lib/hsd-ledger-browser');
const {Device, DeviceInfo} = WebUSB;
const KeyRing = require('hsd/lib/primitives/keyring');

const usb = navigator.usb;

if (!usb) {
  alert('Could not find WebUSB.');
  throw new Error('Could not find WebUSB.');
}

/**
 * @param {DeviceInfo[]} devices
 * @param {DeviceInfo?} selected
 * @param {Device?} device
 */

class DeviceManager {
  constructor() {
    this.deviceInfos = new Set();
    this.devices = new Map();
    this.selected = null;
    this.device = null;

    this.addDevice = this._addDevice.bind(this);
    this.removeDevice = this._removeDevice.bind(this);
  }

  bind() {
    usb.addEventListener('connect', this.addDevice);
    usb.addEventListener('disconnect', this.removeDevice);
  }

  unbind() {
    usb.removeEventListener('connect', this.addDevice);
    usb.removeEventListener('disconnect', this.removeDevice);
  }

  async open() {
    const devices = await Device.getDevices();

    for (const info of devices)
      this._addDevice(info);

    this.bind();
  }

  async close() {
    this.unbind();
    this.reset();
  }

  reset() {
    this.deviceInfos = new Set();
    this.devices = new Map();
    this.selected = null;
    this.device = null;
  }

  _addDevice(info) {
    assert(info.device, 'Could not find device.');
    assert(DeviceInfo.isLedgerDevice(info.device),
      'Device is not ledger.');

    let deviceInfo;

    if (info instanceof DeviceInfo)
      deviceInfo = info;
    else
      deviceInfo = DeviceInfo.fromWebUSBDevice(info.device);

    if (this.devices.has(info.device))
      return this.devices.get(info.device);

    this.devices.set(info.device, deviceInfo);
    this.deviceInfos.add(deviceInfo);

    return deviceInfo;
  }

  _removeDevice(info) {
    assert(info.device, 'Could not find device.');
    if (!DeviceInfo.isLedgerDevice(info.device))
      return;

    const deviceInfo = this.devices.get(info.device);

    if (!deviceInfo)
      return;

    this.deviceInfos.delete(deviceInfo);
    this.devices.delete(info.device);

    return;
  }

  getDevices() {
    return this.deviceInfos.values();
  }

  /**
   * Only User Action can have an access to this.
   * Otherwise this will fail.
   */

  async requestDevice() {
    const device = await Device.requestDevice();

    return this._addDevice(device);
  }

  async openDevice(info, timeout = 20000) {
    assert(!this.selected, 'Other device already in use.');
    assert(this.deviceInfos.has(info), 'Could not find device.');

    this.selected = info;
    this.device = new Device({
      device: info,
      timeout: timeout
    });

    try {
      await this.device.open();
    } catch (e) {
      console.error(e);
      this.selected = null;
      this.device = null;
    }

    return this.device;
  }

  async closeDevice(info) {
    assert(this.selected, 'No device in use.');
    assert(this.deviceInfos.has(info), 'Could not find device.');
    assert(this.selected === info, 'Can not close closed device.');

    await this.device.close();

    this.selected = null;
    this.device = null;
  }
}

const manager = new DeviceManager();
const chooseBtn = document.getElementById('choose');
const chosenDiv = document.getElementById('chosen');
const devicesDiv = document.getElementById('devices');

chooseBtn.addEventListener('click', async () => {
  const device = await manager.requestDevice();

  await manager.openDevice(device);

  renderManager();
});

global.addEventListener('load', async () => {
  await manager.open();

  renderManager();
});

// We rerender all the time..
// Use framework or something.
function renderManager() {
  const selected = manager.selected;
  const devices = manager.getDevices();

  renderChosen(chosenDiv, manager, selected);
  renderDevices(devicesDiv, manager, devices);
}

function renderDevices(element, manager, devices) {
  removeChildren(element);

  for (const device of devices) {
    renderDevice(element, manager, device);
  }
}

function renderDevice(element, manager, info) {
  const container = document.createElement('div');
  const name = document.createElement('span');
  const choose = document.createElement('button');

  choose.innerText = 'Open.';
  name.innerText = deviceInfoMini(info);

  // we don't clean up listeners.. too much headache
  choose.addEventListener('click', async () => {
    await manager.openDevice(info);

    renderManager();
  });

  container.appendChild(name);
  container.appendChild(choose);

  element.appendChild(container);
}

function renderChosen(element, manager, info) {
  removeChildren(element);

  if (!info)
    return;

  const closeBtn = document.createElement('button');

  closeBtn.innerText = 'Close.';
  closeBtn.addEventListener('click', async function close() {
    await manager.closeDevice(info);

    closeBtn.removeEventListener('click', close);

    renderManager();
  });

  const pubkeyBtn = document.createElement('button');
  pubkeyBtn.innerText = 'Get public key';
  pubkeyBtn.addEventListener('click', async () => {
    const device = manager.device;

    if (!device) {
      alert('Could not find device..');
      return;
    }

    const ledger = new LedgerHSD({ device });
    const accountKey = await ledger.getAccountXPUB(0);
    const pubkeyInformation = `
    Account: m/44'/0'/0'
    xpub: ${accountKey.xpubkey()}

    First Receive Address: ${deriveAddress(accountKey, 0, 0, 'main')}
    First Change Address: ${deriveAddress(accountKey, 1, 0, 'main')}
    `;

    const pubkeyElement = document.createElement('span');
    pubkeyElement.innerText = pubkeyInformation;
    element.appendChild(pubkeyElement);
  });

  const information = document.createElement('span');
  information.innerText = deviceInfoAll(info);

  element.appendChild(information);
  element.appendChild(closeBtn);
  element.appendChild(pubkeyBtn);
}

function deviceInfoMini(info) {
  return `${info.manufacturerName} - ${info.productName}`;
}

function deviceInfoAll(info) {
  return `VendorID: ${info.vendorId},
    ProductID: ${info.productId},
    Manufacturer: ${info.manufacturerName},
    Product Name: ${info.productName},
    Serial Number: ${info.serialNumber}
  `;
}

function removeChildren(element) {
  while (element.firstChild)
    element.removeChild(element.firstChild);
}

function deriveAddress(hd, change, index, network) {
  const pubkey = hd.derive(change).derive(index);
  const keyring = KeyRing.fromPublic(pubkey.publicKey, network);

  return keyring.getAddress().toString();
}
