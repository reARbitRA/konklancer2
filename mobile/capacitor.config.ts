import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();
if (!serverUrl) {
  throw new Error('CAPACITOR_SERVER_URL must be set to the HTTPS Konklancer server used by this APK.');
}

const parsedServerUrl = new URL(serverUrl);
if (parsedServerUrl.protocol !== 'https:') {
  throw new Error('The Android wrapper requires an HTTPS server URL.');
}

const config: CapacitorConfig = {
  appId: 'com.rearbitra.konklancer',
  appName: 'Konklancer',
  webDir: 'www',
  server: {
    url: parsedServerUrl.origin,
    cleartext: false,
    allowNavigation: [parsedServerUrl.hostname],
  },
};

export default config;
