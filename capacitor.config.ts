import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dilo.app',
  appName: 'DILO',
  webDir: 'out',
  server: {
    // Use the production URL — Capacitor loads the web app from here
    url: 'https://ordydilo.com',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      backgroundColor: '#0a0a0f',
      showSpinner: false,
      launchAutoHide: true,
      launchShowDuration: 1000,
    },
  },
  ios: {
    scheme: 'DILO',
    backgroundColor: '#0a0a0f',
  },
  android: {
    backgroundColor: '#0a0a0f',
  },
};

export default config;
