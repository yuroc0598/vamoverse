export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '')
  return base ? `${base}${normalizedPath}` : normalizedPath
}
