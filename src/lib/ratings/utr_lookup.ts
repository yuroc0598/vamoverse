// UTR account existence check. Server-only.
//
// UTR's public player search (the endpoint behind utrsports.net's own search box)
// needs no credentials, but it only searches by name and returns at most ~20 hits.
// So we search by the name the player gave and confirm one hit has their UTR ID.
//
// What this proves: a UTR account with that ID exists and its name matches.
// What it does NOT prove: that the requesting user owns the account (names and
// IDs are public), or their rating (UTR hides ratings from anonymous callers for
// most players). Ownership/rating verification needs the partner Engage API.
//
// The endpoint is undocumented and may change or block requests; callers must
// treat 'unavailable' as a normal outcome.

export const DEFAULT_UTR_SEARCH_URL = 'https://api.utrsports.net/v2/search/players'
const SEARCH_RESULT_LIMIT = 20
const DEFAULT_TIMEOUT_MS = 8000

export interface UtrAccount {
  id: string
  displayName: string
  claimed: boolean
  location: string | null
}

export type UtrLookupResult =
  | { status: 'found'; account: UtrAccount }
  /** The ID appeared in results, but under a different name. */
  | { status: 'name_mismatch' }
  /** More accounts share this exact name than UTR shows anonymously, and the ID wasn't among those shown. */
  | { status: 'too_many_matches'; totalMatches: number }
  | { status: 'not_found' }
  | { status: 'unavailable'; reason: string }

export interface UtrLookupOptions {
  fetchImpl?: typeof fetch
  searchUrl?: string
  timeoutMs?: number
}

/**
 * Accepts a bare numeric UTR ID or a UTR profile URL
 * (e.g. https://app.utrsports.net/profiles/1234567) and returns the numeric ID.
 */
export function parseUtrId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{1,12}$/.test(trimmed)) return trimmed.replace(/^0+(?=\d)/, '')
  const fromUrl = trimmed.match(/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*utrsports\.net\/profiles\/(\d{1,12})(?:[/?#].*)?$/i)
  return fromUrl ? fromUrl[1].replace(/^0+(?=\d)/, '') : null
}

/** Case-, accent-, punctuation-, and whitespace-insensitive form of a person's name. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface UtrSearchHit {
  id?: unknown
  displayName?: unknown
  firstName?: unknown
  lastName?: unknown
  claimed?: unknown
  isDemoPlayer?: unknown
  location?: { display?: unknown } | null
}

function hitNames(hit: UtrSearchHit): string[] {
  const names: string[] = []
  if (typeof hit.displayName === 'string') names.push(hit.displayName)
  if (typeof hit.firstName === 'string' && typeof hit.lastName === 'string') {
    names.push(`${hit.firstName} ${hit.lastName}`)
  }
  return names.map(normalizeName).filter(Boolean)
}

export async function lookupUtrAccount(
  input: { utrId: string; name: string },
  options: UtrLookupOptions = {},
): Promise<UtrLookupResult> {
  const utrId = parseUtrId(input.utrId)
  const wantedName = normalizeName(input.name)
  if (!utrId || !wantedName) return { status: 'not_found' }

  const fetchImpl = options.fetchImpl ?? fetch
  const url = new URL(options.searchUrl ?? process.env.UTR_SEARCH_URL ?? DEFAULT_UTR_SEARCH_URL)
  url.searchParams.set('query', input.name.trim())
  url.searchParams.set('top', String(SEARCH_RESULT_LIMIT))

  let payload: any
  try {
    const response = await fetchImpl(url.toString(), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!response.ok) return { status: 'unavailable', reason: `http_${response.status}` }
    payload = await response.json()
  } catch (error) {
    const name = (error as { name?: string })?.name
    return { status: 'unavailable', reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network_error' }
  }

  if (!payload || !Array.isArray(payload.hits)) return { status: 'unavailable', reason: 'unexpected_response' }

  const hits: UtrSearchHit[] = payload.hits
    .map((hit: any) => hit?.source)
    .filter((source: unknown): source is UtrSearchHit => Boolean(source) && typeof source === 'object')

  const byId = hits.find((hit) => String(hit.id) === utrId && hit.isDemoPlayer !== true)
  if (byId) {
    if (!hitNames(byId).includes(wantedName)) return { status: 'name_mismatch' }
    const location = typeof byId.location?.display === 'string' ? byId.location.display : null
    return {
      status: 'found',
      account: {
        id: utrId,
        displayName: String(byId.displayName ?? '').trim() || input.name.trim(),
        claimed: byId.claimed === true,
        location,
      },
    }
  }

  // UTR's search is fuzzy and ranks exact name matches first, so `total` counts
  // partial matches too. Only when the last visible hit is still an exact match
  // can more same-name accounts be hidden past the anonymous result cap.
  const total = typeof payload.total === 'number' ? payload.total : hits.length
  const lastHit = hits[hits.length - 1]
  if (total > hits.length && lastHit && hitNames(lastHit).includes(wantedName)) {
    return { status: 'too_many_matches', totalMatches: total }
  }
  return { status: 'not_found' }
}
