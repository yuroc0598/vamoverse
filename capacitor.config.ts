import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.vamoverse.app',
  appName: 'Vamoverse',
  webDir: 'out',
  server: {
    // For livereload during dev: uncomment and set your IP
    // url: 'http://192.168.1.XX:3000',
    // cleartext: true,
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
