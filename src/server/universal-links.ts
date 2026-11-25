// apple-app-site-association: which web paths open in the native app (universal links).
// Paths come from the same route table as the app's router (src/lib/app-routes.ts).
import { APP_ROUTES } from '@/lib/app-routes'

/** The App Store app's bundle id (Release); see ios-native/Config/Release.xcconfig. */
const IOS_BUNDLE_ID = 'com.vamoverse.app'

/** Never open these in the app: API, hosted dev pages, admin, and sign-in callbacks (PKCE ties the code to the browser). */
const EXCLUDED_PATHS = ['/api/*', '/dev/*', '/admin', '/admin/*', '/login', '/auth/*', '/onboarding']

/** Native screens worth opening from a link (the landing page and sign-in stay on the web). */
export function claimedPaths(): string[] {
  const skip = new Set(['home', 'signIn', 'onboarding'])
  const paths = APP_ROUTES
    .filter((route) => route.target === 'native' && !skip.has(route.screen))
    .map((route) => route.pattern.replace(/:[^/]+/g, '*'))
  return [...new Set(paths)]
}

export function appSiteAssociation(teamId: string) {
  return {
    applinks: {
      details: [{
        appIDs: [`${teamId}.${IOS_BUNDLE_ID}`],
        // Order matters: the first matching component wins, so exclusions come first.
        components: [
          ...EXCLUDED_PATHS.map((path) => ({ '/': path, exclude: true, comment: 'Stays on the web' })),
          ...claimedPaths().map((path) => ({ '/': path })),
        ],
      }],
    },
  }
}
