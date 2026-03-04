export interface ActivityLocationValue {
  /**
   * First line for display and maps queries.
   * Typically a street + number or a place/building name.
   */
  line1?: string

  /**
   * Second-line components used for display and approximate maps queries.
   * We keep pieces so we can format \"city, state\" (US) vs \"city, country\" (non-US).
   */
  city?: string
  state?: string
  country?: string

  /**
   * Optional ISO codes for country and state/region, used to drive pickers.
   */
  countryCode?: string
  stateCode?: string

  /**
   * When true, visitors who are not members/managers/owners
   * should not see the exact line1/fullAddress. They only see coarse location.
   */
  isExactLocationPrivate?: boolean

  /**
   * When true, the activity is held online (no physical location).
   */
  online?: boolean

  /**
   * Optional URL for the online meeting (e.g. Zoom, Google Meet link).
   * When set, display name can be derived from host (e.g. zoom.us → "Zoom").
   */
  onlineUrl?: string

  /**
   * When true for an online activity that has a meeting URL, visitors who are
   * not members/managers/owners should not get a clickable link. They still
   * see that the activity is online (e.g. "Zoom"), but clicking the badge
   * should show the same "members only" notification as private physical
   * addresses.
   */
  isOnlineLocationPrivate?: boolean
}

/**
 * Derive a friendly display name from an online meeting URL host.
 * Used for activity location when online with a URL.
 */
export function getOnlineLocationDisplayName(url: string): string {
  if (!url || typeof url !== 'string') return 'Online'
  const trimmed = url.trim()
  if (!trimmed) return 'Online'
  try {
    const parsed = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`)
    const host = (parsed.hostname || '').replace(/^www\./i, '').toLowerCase()
    const known: Record<string, string> = {
      'zoom.us': 'Zoom',
      'us02web.zoom.us': 'Zoom',
      'us04web.zoom.us': 'Zoom',
      'us05web.zoom.us': 'Zoom',
      'us06web.zoom.us': 'Zoom',
      'meet.google.com': 'Google Meet',
      'teams.microsoft.com': 'Microsoft Teams',
      'meet.jit.si': 'Jitsi Meet',
      'whereby.com': 'Whereby',
      'webex.com': 'Webex',
      'gotomeeting.com': 'GoToMeeting',
      'bluejeans.com': 'BlueJeans',
      'ringcentral.com': 'RingCentral',
      'discord.com': 'Discord',
      'discord.gg': 'Discord',
    }
    for (const [domain, name] of Object.entries(known)) {
      if (host === domain || host.endsWith('.' + domain)) return name
    }
    const firstPart = host.split('.')[0] || host
    return firstPart.charAt(0).toUpperCase() + firstPart.slice(1)
  } catch {
    return 'Online'
  }
}

