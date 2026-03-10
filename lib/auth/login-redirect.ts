export const DEFAULT_RETURN_TO = '/main'

/**
 * Prevent open-redirects by only allowing in-app relative paths.
 * Keeps query + hash if present.
 */
export function sanitizeReturnTo(value: string | null | undefined): string {
  const raw = (value ?? '').trim()
  if (!raw) return DEFAULT_RETURN_TO

  // Only allow relative paths that start with a single "/"
  // Disallow protocol-relative ("//evil.com") and absolute URLs.
  if (!raw.startsWith('/') || raw.startsWith('//')) {
    return DEFAULT_RETURN_TO
  }

  return raw
}

export function getReturnToFromUrl(url: URL): string {
  // Preserve query string. Hash is never sent to server; client can include it.
  return `${url.pathname}${url.search}`
}

export function getReturnToFromReferer(referer: string | null): string {
  if (!referer) return DEFAULT_RETURN_TO
  try {
    const u = new URL(referer)
    return sanitizeReturnTo(`${u.pathname}${u.search}${u.hash}`)
  } catch {
    return DEFAULT_RETURN_TO
  }
}

export function buildLoginHref(params: {
  returnTo?: string | null
  blocked?: boolean
  error?: string | null
}): string {
  const returnTo = sanitizeReturnTo(params.returnTo)
  const sp = new URLSearchParams()
  sp.set('returnTo', returnTo)
  if (params.blocked) sp.set('blocked', 'true')
  if (params.error) sp.set('error', params.error)
  return `/login?${sp.toString()}`
}

