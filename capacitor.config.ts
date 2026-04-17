import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dilo.app',
  appName: 'DILO',
  webDir: 'out',
  server: {
    // CN-017: build-time swap — dev/TestFlight builds point at staging/local,
    // release builds at prod. Default keeps prior behaviour.
    url: process.env.CAP_SERVER_URL || 'https://ordydilo.com',
    cleartext: false,
    allowNavigation: ['ordydilo.com', '*.ordydilo.com'],
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
