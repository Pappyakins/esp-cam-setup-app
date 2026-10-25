// JakinsCraft ESP Cam Setup (Android app) — provisions doorbell cams over
// Bluetooth LE. Native port of the ESP Cam Setup PWA: Web Bluetooth does not
// work inside an Android WebView, so BLE goes through the
// @capacitor-community/bluetooth-le plugin (window.BleClient, ble-bridge.js).
// Protocol: firmware/PROVISIONING.md in Pappyakins/whatsapp-doorbell-cam.
const SVC      = '8d4f0001-3c2a-4b5e-9f1a-2b3c4d5e6f70';
const C_SSID   = '8d4f0002-3c2a-4b5e-9f1a-2b3c4d5e6f70';
const C_PASS   = '8d4f0003-3c2a-4b5e-9f1a-2b3c4d5e6f70';
const C_NAME   = '8d4f0004-3c2a-4b5e-9f1a-2b3c4d5e6f70';
const C_TO     = '8d4f0005-3c2a-4b5e-9f1a-2b3c4d5e6f70';
const C_SERVER = '8d4f0006-3c2a-4b5e-9f1a-2b3c4d5e6f70';
const C_TOKEN  = '8d4f0007-3c2a-4b5e-9f1a-2b3c4d5e6f70';
const C_CTRL   = '8d4f0008-3c2a-4b5e-9f1a-2b3c4d5e6f70';
const C_STATE  = '8d4f0009-3c2a-4b5e-9f1a-2b3c4d5e6f70';

const $ = (id) => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();
let deviceId = null;
let deviceName = '';
let connected = false;
let scanning = false;
let scanTimer = null;
let expectedDrop = false; // we told the cam to restart (APPLY / ERASE)
let lockState = false; // slider state, read from the cam on connect
let eraseArmed = false;
let eraseTimer = null;
const found = new Map(); // deviceId -> display name

function Ble() { return window.BleClient; }
function status(msg) { $('status').textContent = msg; }
function log(msg) {
  const el = $('log');
  el.textContent = (msg + '\n' + el.textContent).split('\n').slice(0, 8).join('\n');
}
function setFormEnabled(on) {
  document.querySelectorAll('#form input').forEach((i) => (i.disabled = !on));
  $('btn-save').disabled = !on;
  $('btn-erase').disabled = !on;
}
function errText(e) { return e && e.message ? e.message : String(e); }

async function readStr(uuid) {
  const v = await Ble().read(deviceId, SVC, uuid);
  return dec.decode(v).trim();
}
async function writeStr(uuid, s) {
  const b = enc.encode(s);
  await Ble().write(deviceId, SVC, uuid, new DataView(b.buffer, b.byteOffset, b.byteLength));
}

function onDisconnected() {
  connected = false;
  deviceId = null;
  if (expectedDrop) { expectedDrop = false; setFormEnabled(false); return; } // lock restart: keep slider at locked
  lockState = false;
  $('lock-slider').value = 0;
  setFormEnabled(false);
  status('Camera disconnected. Power it on in setup mode and tap Find camera to reconnect.');
}

function renderDevices() {
  const wrap = $('devices');
  wrap.innerHTML = '';
  found.forEach((name, id) => {
    const btn = document.createElement('button');
    btn.className = 'device';
    btn.textContent = name;
    btn.onclick = () => connectTo(id, name);
    wrap.appendChild(btn);
  });
}

async function stopScan() {
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  if (scanning) {
    scanning = false;
    try { await Ble().stopLEScan(); } catch (e) { /* ignore */ }
  }
  $('btn-scan').disabled = false;
}

async function find() {
  if (!window.BleClient) {
    status('Bluetooth LE is not available in this app, camera setup cannot run.');
    return;
  }
  try {
    // initialize() also asks for the Android Bluetooth permissions.
    // neverForLocation: the app never derives location from scans (the app
    // manifest asserts the neverForLocation flag on BLUETOOTH_SCAN).
    await Ble().initialize({ androidNeverForLocation: true });
    const enabled = await Ble().isEnabled().catch(() => true);
    if (!enabled) {
      try {
        await Ble().requestEnable();
      } catch (e) {
        status('Bluetooth is off. Turn Bluetooth on, then tap Find camera.');
        return;
      }
    }
    found.clear();
    renderDevices();
    $('btn-scan').disabled = true;
    status('Scanning for cameras… the camera flash blinks once a second while it waits.');
    scanning = true;
    await Ble().requestLEScan({ services: [SVC] }, (result) => {
      const d = result && result.device;
      if (!d || !d.deviceId || found.has(d.deviceId)) return;
      const name = d.name || result.localName || '';
      const uuids = result.uuids || [];
      if (name.indexOf('JakinsCam') !== 0 && uuids.indexOf(SVC) === -1) return;
      found.set(d.deviceId, name || 'JakinsCam');
      renderDevices();
      status('Found ' + (name || 'a camera') + '. Tap it above to connect.');
    });
    scanTimer = setTimeout(async () => {
      await stopScan();
      if (!connected) {
        status(found.size
          ? 'Scan stopped. Tap a camera above to connect, or tap Find camera to scan again.'
          : 'No camera found. Make sure the camera is powered on and its flash is blinking, then tap Find camera.');
      }
    }, 20000);
  } catch (e) {
    await stopScan();
    status('Bluetooth error: ' + errText(e) + ' Check that Bluetooth is on and the app has the Nearby devices permission.');
  }
}

async function connectTo(id, name) {
  try {
    await stopScan();
    deviceId = id;
    deviceName = name || 'camera';
    status('Connecting to ' + deviceName + '…');
    await Ble().connect(id, () => onDisconnected());
    connected = true;
    $('f-ssid').value = await readStr(C_SSID);
    $('f-name').value = await readStr(C_NAME);
    $('f-to').value = await readStr(C_TO);
    $('f-server').value = await readStr(C_SERVER);
    $('f-token').value = await readStr(C_TOKEN);
    $('f-pass').value = '';
    // Fall back to this phone's remembered defaults only if the cam has none.
    try {
      const d = JSON.parse(localStorage.getItem('espSetupDefaults') || '{}');
      if (!$('f-server').value && d.server) $('f-server').value = d.server;
      if (!$('f-token').value && d.token) $('f-token').value = d.token;
    } catch (e) { /* ignore */ }
    // Position the lock slider from the cam's own locked flag.
    try { lockState = (await readStr(C_STATE)) === 'locked'; }
    catch (e) { lockState = false; } // older firmware has no state characteristic
    $('lock-slider').value = lockState ? 100 : 0;
    setFormEnabled(true);
    status('Connected to ' + deviceName + '. Edit the values, then tap Save to camera.');
    log('Connected: ' + deviceName);
  } catch (e) {
    connected = false;
    deviceId = null;
    status('Connect failed: ' + errText(e));
  }
}

async function save() {
  if (!connected) return;
  const ssid = $('f-ssid').value.trim();
  if (!ssid) { status('Wi-Fi name (SSID) cannot be empty.'); return; }
  try {
    $('btn-save').disabled = true;
    status('Saving to camera…');
    await writeStr(C_SSID, ssid);
    await writeStr(C_PASS, $('f-pass').value);            // blank = keep stored password
    await writeStr(C_NAME, $('f-name').value.trim());
    await writeStr(C_TO, $('f-to').value.replace(/[^0-9]/g, ''));
    await writeStr(C_SERVER, $('f-server').value.trim());
    await writeStr(C_TOKEN, $('f-token').value.trim());
    expectedDrop = true; // APPLY makes the camera restart and drop the link
    await writeStr(C_CTRL, 'APPLY');
    let result = '';
    try { result = await readStr(C_CTRL); } catch (e) { /* camera may already be restarting */ }
    try {
      localStorage.setItem('espSetupDefaults', JSON.stringify({
        server: $('f-server').value.trim(), token: $('f-token').value.trim(),
      }));
    } catch (e) { /* ignore */ }
    if (result === 'saved' || result === '') {
      status('Saved. The camera is restarting and will join the Wi-Fi, then send its online photo to WhatsApp.');
      log('Settings saved to camera.');
    } else {
      status('Camera replied: ' + result);
    }
    connected = false;
    setFormEnabled(false);
  } catch (e) {
    expectedDrop = false;
    status('Save failed: ' + errText(e));
    $('btn-save').disabled = false;
  }
}

async function erase() {
  if (!connected) return;
  if (!eraseArmed) {
    // Two-tap confirm (window.confirm is unreliable inside WebViews).
    eraseArmed = true;
    $('btn-erase').textContent = 'Tap again to confirm erase';
    status('Erase the settings stored in this camera? It will fall back to its built-in defaults. Tap Erase again to confirm.');
    eraseTimer = setTimeout(() => {
      eraseArmed = false;
      $('btn-erase').textContent = 'Erase camera settings';
    }, 6000);
    return;
  }
  clearTimeout(eraseTimer);
  eraseArmed = false;
  $('btn-erase').textContent = 'Erase camera settings';
  try {
    expectedDrop = true; // ERASE makes the camera restart and drop the link
    status('Erasing…');
    await writeStr(C_CTRL, 'ERASE');
    status('Erased. The camera is restarting with its built-in defaults.');
    log('Camera settings erased.');
    connected = false;
    setFormEnabled(false);
  } catch (e) {
    expectedDrop = false;
    status('Erase failed: ' + errText(e));
  }
}

// Lock slider: the slider SHOWS the cam's locked flag, it is not a
// one-way action. Slide right to save the form and LOCK, slide left to
// UNLOCK (clears the flag, no restart, the window keeps running).
// A timeout with no action leaves the flag exactly as it was.
async function lock() {
  if (!connected) return;
  const ssid = $('f-ssid').value.trim();
  if (!ssid) { status('Wi-Fi name (SSID) cannot be empty.'); $('lock-slider').value = 0; return; }
  try {
    $('lock-slider').disabled = true;
    status('Locking these details in the camera…');
    await writeStr(C_SSID, ssid);
    await writeStr(C_PASS, $('f-pass').value);            // blank = keep stored password
    await writeStr(C_NAME, $('f-name').value.trim());
    await writeStr(C_TO, $('f-to').value.replace(/[^0-9]/g, ''));
    await writeStr(C_SERVER, $('f-server').value.trim());
    await writeStr(C_TOKEN, $('f-token').value.trim());
    expectedDrop = true; // LOCK makes the camera restart and drop the link
    await writeStr(C_CTRL, 'LOCK');
    let result = '';
    try { result = await readStr(C_CTRL); } catch (e) { /* camera may already be restarting */ }
    try {
      localStorage.setItem('espSetupDefaults', JSON.stringify({
        server: $('f-server').value.trim(), token: $('f-token').value.trim(),
      }));
    } catch (e) { /* ignore */ }
    if (result === 'locked' || result === '') {
      lockState = true;
      status('Locked. These details are saved in the camera, future boots will skip setup. Hold the setup button while powering on to reopen setup.');
      log('Settings locked in camera.');
    } else {
      status('Camera replied: ' + result);
    }
    connected = false;
    setFormEnabled(false);
    $('lock-slider').value = 100;
  } catch (e) {
    expectedDrop = false;
    status('Lock failed: ' + errText(e));
    $('lock-slider').disabled = false;
    $('lock-slider').value = 0; // was unlocked before
  }
}

async function unlock() {
  if (!connected) return;
  try {
    $('lock-slider').disabled = true;
    status('Unlocking setup…');
    await writeStr(C_CTRL, 'UNLOCK');
    let result = '';
    try { result = await readStr(C_CTRL); } catch (e) { /* ignore */ }
    if (result === 'unlocked' || result === '') {
      lockState = false;
      status('Unlocked. Future boots will open setup again. The setup window is still running, you can edit and save, or leave it to time out.');
      log('Setup unlocked.');
    } else {
      status('Camera replied: ' + result);
    }
    $('lock-slider').value = 0;
    $('lock-slider').disabled = false;
  } catch (e) {
    status('Unlock failed: ' + errText(e));
    $('lock-slider').disabled = false;
    $('lock-slider').value = 100; // was locked before
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('btn-scan').onclick = find;
  $('btn-save').onclick = save;
  $('btn-erase').onclick = erase;
  $('lock-slider').addEventListener('change', () => {
    const v = Number($('lock-slider').value);
    if (v >= 50 && !lockState) { lock(); }
    else if (v < 50 && lockState) { unlock(); }
    else { $('lock-slider').value = lockState ? 100 : 0; } // short slides snap back
  });
  setFormEnabled(false);
  if (!window.BleClient) {
    status('Bluetooth LE did not load in this app. Try reinstalling the app.');
  }
});
