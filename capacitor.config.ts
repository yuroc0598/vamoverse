import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.vamoverse.app',
  appName: 'Vamoverse',
  webDir: 'out',
  server: {
    // Livereload during dev: Mac LAN IP (Mac + iPhone must be on same WiFi)
    url: 'http://172.24.237.7:3000',
    cleartext: true,
  },
  ios: {
    contentInset: 'always',
    // Enable scrolling
    scrollEnabled: true,
    // Background color for status bar
    backgroundColor: '#ffffff',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
    },
  },
}

export default config
