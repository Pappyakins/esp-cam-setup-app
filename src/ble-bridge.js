// Bundled with esbuild into www/ble-bridge.js (npm run build:bridge).
// Exposes the Bluetooth LE plugin to the plain-script app.js as
// window.BleClient, same pattern as the other JakinsCraft apps'
// share-bridge.js.
import { BleClient } from '@capacitor-community/bluetooth-le';

window.BleClient = BleClient;
