// Every web path the native app knows how to open, with the screen it maps to. The iOS Router
// is generated from this table (docs/api/routes.json); universal links, push `link`s, and
// notification taps all go through it. Tests check that every web page and every link the
// server writes (notifications, payment return URLs) matches an entry here.

export interface AppRoute {
  /** Path with `:param` segments, matched segment by segment. */
  pattern: string
  /** Native destination (`safari` routes open the web page in Safari instead). */
  screen: string
  target: 'native' | 'safari'
  /** Query parameters the screen reads (others are ignored). */
  query?: string[]
  /** Works signed out, as on the web. */
  public?: boolean
}

const native = (pattern: string, screen: string, extra: Partial<AppRoute> = {}): AppRoute => ({ pattern, screen, target: 'native', ...extra })
const safari = (pattern: string): AppRoute => ({ pattern, screen: 'safari', target: 'safari', public: true })

/** Order matters: the first match wins (`/offerings/new` before `/offerings/:id`). */
export const APP_ROUTES: AppRoute[] = [
  native('/', 'home', { public: true }),
  native('/login', 'signIn', { public: true, query: ['next'] }),
  native('/onboarding', 'onboarding', { query: ['next'] }),
  native('/today', 'today', { query: ['package'] }),
  native('/find', 'find', { public: true, query: ['type', 'area', 'q'] }),
  native('/p/:slug', 'provider', { public: true }),
  native('/s/:id', 'session', { public: true, query: ['cancelled'] }),
  native('/b/:id', 'booking', { public: true, query: ['t', 'paid'] }),
  native('/schedule', 'schedule', { query: ['week'] }),
  native('/sessions/:id', 'sessionManage'),
  native('/offerings/new', 'offeringNew'),
  native('/offerings/:id', 'offering'),
  native('/crew', 'crew', { query: ['q'] }),
  native('/money', 'money'),
  native('/messages', 'messages'),
  native('/messages/:id', 'conversation'),
  native('/notifications', 'notifications'),
  native('/settings', 'settings'),
  native('/settings/account', 'settingsAccount'),
  native('/settings/family', 'settingsFamily', { query: ['welcome'] }),
  native('/settings/business', 'settingsBusiness', { query: ['welcome'] }),
  native('/settings/payments', 'settingsPayments'),
  native('/settings/payouts', 'settingsPayouts', { query: ['refresh', 'returned', 'subscribed', 'canceled'] }),
  safari('/admin'),
  safari('/privacy'),
  safari('/terms'),
]

/** Web pages the app never routes to: hosted flows it opens in a browser sheet. */
export const WEB_ONLY_PAGES = ['/dev/simulate']

export interface RouteMatch { route: AppRoute; params: Record<string, string>; query: Record<string, string> }

/** Matches a path (optionally with a query string or full app URL) against `APP_ROUTES`. */
export function matchAppRoute(link: string): RouteMatch | null {
  const url = new URL(link, 'https://app.invalid')
  const segments = url.pathname.split('/').filter(Boolean)
  for (const route of APP_ROUTES) {
    const pattern = route.pattern.split('/').filter(Boolean)
    if (pattern.length !== segments.length) continue
    const params: Record<string, string> = {}
    if (!pattern.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(segments[i])), true) : p === segments[i]))) continue
    const query: Record<string, string> = {}
    for (const key of route.query ?? []) {
      const value = url.searchParams.get(key)
      if (value !== null) query[key] = value
    }
    return { route, params, query }
  }
  return null
}
