/** Only same-site relative paths may be used as post-login redirects. */
export function safeNext(next: string | null | undefined, fallback = '/today'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
