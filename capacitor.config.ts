import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.konkred.konklancer',
  appName: 'KonkLancer Studio',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    backgroundColor: '#020617',
    allowMixedContent: true,
  },
  plugins: {
    // Routes fetch() inside the Android APK through Android's native HTTP stack,
    // bypassing browser CORS limits on Ponisha, Karlancer, Parscoders, Telegram & all LLM endpoints.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
