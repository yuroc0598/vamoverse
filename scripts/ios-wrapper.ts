// The Capacitor web wrapper (ios-wrapper/: the Xcode project, capacitor.config.ts, its offline page,
// and the device helper ios.sh) is retired in favour of the native app (ios-native/).
// It stays in the repo, switched off by default:
//
//   IOS_WRAPPER_DISABLED=false npm run ios:sync     use a wrapper command anyway
//
// Run directly (the wrapper's npm scripts do this first), it stops with a pointer to the native
// equivalent while the wrapper is disabled.

/** True unless IOS_WRAPPER_DISABLED is exactly "false". */
export function wrapperDisabled(): boolean {
  return process.env.IOS_WRAPPER_DISABLED?.trim().toLowerCase() !== 'false'
}

export const WRAPPER_DISABLED_MESSAGE =
  'The Capacitor web wrapper (ios-wrapper/) is disabled; the native app replaces it. Use npm run ios:sim:native, ' +
  'npm run test:ios-native, or open ios-native/Vamoverse.xcodeproj. To use the wrapper anyway: IOS_WRAPPER_DISABLED=false npm run <command>.'

if (require.main === module && wrapperDisabled()) {
  console.error(WRAPPER_DISABLED_MESSAGE)
  process.exit(1)
}
