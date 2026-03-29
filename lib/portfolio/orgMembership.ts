export function normalizeEmailSuffix(raw: string): string {
  const s = (raw || '').trim().toLowerCase()
  if (!s) return ''
  // Allow "company.com" or "@company.com"
  return s.startsWith('@') ? s.slice(1) : s
}

export function normalizeEmailSuffixes(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === 'string' ? normalizeEmailSuffix(v) : ''))
      .filter(Boolean)
      .filter((v, idx, arr) => arr.indexOf(v) === idx)
  }
  if (typeof raw === 'string') {
    // Accept comma / space separated input for convenience
    const parts = raw
      .split(/[, \n\r\t]+/g)
      .map((p) => normalizeEmailSuffix(p))
      .filter(Boolean)
    return [...new Set(parts)]
  }
  return []
}

export function emailDomainFromEmail(email: string | null | undefined): string {
  const e = (email || '').trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 0) return ''
  return e.slice(at + 1).trim()
}

export function isEmailEligibleForOrgMembership(
  email: string | null | undefined,
  suffixes: unknown
): boolean {
  const domain = emailDomainFromEmail(email)
  if (!domain) return false
  const list = normalizeEmailSuffixes(suffixes)
  if (list.length === 0) return false
  return list.some((suf) => domain === suf || domain.endsWith(`.${suf}`))
}

