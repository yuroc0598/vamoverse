import type { CapacitorConfig } from '@capacitor/cli'

const capacitorServerUrl = process.env.CAPACITOR_SERVER_URL || (process.env.NODE_ENV === 'production' ? 'https://vamoverse.app' : undefined)
const isDev = process.env.NODE_ENV !== 'production'

if (!isDev && capacitorServerUrl && !capacitorServerUrl.startsWith('https://')) {
  throw new Error('Production CAPACITOR_SERVER_URL must use HTTPS')
}

const config: CapacitorConfig = {
  appId: 'com.vamoverse.app',
  appName: 'Vamoverse',
  webDir: 'mobile-shell', // offline fallback; release content is the hosted HTTPS app
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
