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

export function normalizeApprovedEmails(raw: unknown): string[] {
  const normalizeOne = (v: string) => v.trim().toLowerCase()
  const acceptOne = (v: string) => {
    const s = normalizeOne(v)
    if (!s) return ''
    // Basic sanity check; exact-match only (no wildcards).
    if (!s.includes('@')) return ''
    return s
  }

  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === 'string' ? acceptOne(v) : ''))
      .filter(Boolean)
      .filter((v, idx, arr) => arr.indexOf(v) === idx)
  }
  if (typeof raw === 'string') {
    const parts = raw
      .split(/[, \n\r\t]+/g)
      .map((p) => acceptOne(p))
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

export function isEmailEligibleForOrgMembership(email: string | null | undefined, suffixes: unknown): boolean {
  const domain = emailDomainFromEmail(email)
  if (!domain) return false
  const list = normalizeEmailSuffixes(suffixes)
  if (list.length === 0) return false
  return list.some((suf) => domain === suf || domain.endsWith(`.${suf}`))
}

export function isEmailEligibleForOrgMembershipRule(
  email: string | null | undefined,
  orgMembership:
    | {
        enabled?: boolean
        email_suffixes?: unknown
        approved_emails?: unknown
      }
    | null
    | undefined
): boolean {
  const e = (email || '').trim().toLowerCase()
  if (!e) return false
  if (!orgMembership || orgMembership.enabled !== true) return false

  const approved = normalizeApprovedEmails(orgMembership.approved_emails)
  if (approved.length > 0 && approved.includes(e)) {
    return true
  }

  // Fallback to suffix-based eligibility.
  return isEmailEligibleForOrgMembership(e, orgMembership.email_suffixes)
}

