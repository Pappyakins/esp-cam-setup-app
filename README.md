# ESP Cam Setup (Android app)

Native Android version of the JakinsCraft **ESP Cam Setup** app. It provisions
the ESP32-CAM WhatsApp doorbell cameras over Bluetooth Low Energy: scan for a
camera in setup mode, read its current settings, edit them, and save them back.

This is the native port of the [ESP Cam Setup PWA](https://github.com/Pappyakins/esp-cam-setup).
Web Bluetooth does not work inside an Android WebView, so this app is built with
Capacitor 7 and the `@capacitor-community/bluetooth-le` plugin instead. Same
screens, same fields, same behaviour as the PWA.

## What it sets

- Wi-Fi name (SSID) and password (blank password keeps the stored one)
- Camera name (e.g. `Front Door`)
- Receiver WhatsApp number (digits with country code; blank = server default)
- Advanced: server URL and device token

Buttons: **Find camera** (scan + device list), **Save to camera** (writes all
fields, then `APPLY`), **Erase camera settings** (two-tap confirm, sends
`ERASE`).

## BLE protocol

Service UUID `8d4f0001-3c2a-4b5e-9f1a-2b3c4d5e6f70`, characteristics
`...0002` SSID, `...0003` password, `...0004` name, `...0005` receiver,
`...0006` server URL, `...0007` token, `...0008` control (`APPLY` / `ERASE`,
read returns `ready` / `saved` / `erased`). The camera advertises as
`JakinsCam-XXXX` for 5 minutes after every power-on boot. Full protocol:
`firmware/PROVISIONING.md` in
[Pappyakins/whatsapp-doorbell-cam](https://github.com/Pappyakins/whatsapp-doorbell-cam).

The app reads the values off the camera itself. No server or token is baked
into this repo or the app; the only thing remembered on the phone is the last
saved server/token pair in local storage, used as a fallback when a camera
has none.

## Permissions

Bluetooth on Android 12+ needs the **Nearby devices** permission
(`BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT`); the app asserts
`neverForLocation` and never derives location from scans. Older Android
versions use the plugin's legacy Bluetooth/location permissions. All
permissions are declared by the plugin manifest plus the app manifest and are
requested when you tap **Find camera**.

## Build

```sh
npm install
npm run build:bridge   # esbuild: src/ble-bridge.js -> www/ble-bridge.js
npx cap sync android
cd android && ./gradlew assembleRelease
```

- Capacitor pinned to 7.6.9 (Capacitor 8 needs Node 22+; the build server
  runs Node 20).
- Package: `com.jakinscraft.espcamsetup`, app name **ESP Cam Setup**.
- Release builds are signed with the JakinsCraft keystore.

## Layout

- `www/` — the app UI (`index.html`, `app.js`), copied from the PWA and
  re-pointed from Web Bluetooth to `window.BleClient`.
- `src/ble-bridge.js` — one-line bridge that exposes the BLE plugin to the
  plain-script `app.js`; bundled by esbuild into `www/ble-bridge.js`.
- `android/` — Capacitor Android project (launcher icon is the JakinsCraft
  S swirl, `assets/icon-512.png` is the source art).

By JakinsCraft.
