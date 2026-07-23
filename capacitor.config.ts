import type { CapacitorConfig } from '@capacitor/cli'

const capacitorServerUrl = process.env.CAPACITOR_SERVER_URL || undefined
const isDev = process.env.NODE_ENV !== 'production'

const config: CapacitorConfig = {
  appId: 'com.vamoverse.app',
  appName: 'Vamoverse',
  webDir: 'out', // static export output dir when CAPACITOR_EXPORT=true
  ...(capacitorServerUrl
    ? {
        server: {
          url: capacitorServerUrl,
          cleartext: isDev,
        },
      }
    : isDev && process.env.CAPACITOR_ALLOW_LIVERELOAD === 'true'
      ? {
          server: {
            url: process.env.CAPACITOR_DEV_URL,
            cleartext: true,
          },
        }
      : {}),
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    backgroundColor: '#ffffff',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
    },
  },
}

export default config
