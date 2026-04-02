export type ActivityUpdateChangeKind = 'time' | 'location' | 'time_and_location'

export interface ParsedActivityUpdateMessage {
  portfolioRef: string
  /** Name embedded in the server message (may differ slightly from current portfolio title). */
  spaceNameFromMessage: string
  changeKind: ActivityUpdateChangeKind
}

/**
 * Parses portfolio ref plus who/what changed from DM text when a space's time/location was updated.
 */
export function parseActivityUpdateMessageDetails(
  text: string | null | undefined
): ParsedActivityUpdateMessage | null {
  const ref = parseActivityUpdatePortfolioRefFromMessage(text)
  if (!ref || !text) return null
  const m = text.match(
    /updated the (time and location|time|location) for (.+?) \((?:space|activity|portfolio)\)\./i
  )
  if (!m?.[1] || !m[2]) {
    return {
      portfolioRef: ref,
      spaceNameFromMessage: '',
      changeKind: 'time_and_location',
    }
  }
  const raw = m[1].toLowerCase().trim()
  const changeKind: ActivityUpdateChangeKind =
    raw === 'time and location' ? 'time_and_location' : raw === 'time' ? 'time' : 'location'
  return {
    portfolioRef: ref,
    spaceNameFromMessage: m[2].trim(),
    changeKind,
  }
}

/**
 * Parses portfolio id (UUID) or slug from DM text when a space's time/location was updated.
 * Matches current server copy and legacy formats.
 */
export function parseActivityUpdatePortfolioRefFromMessage(
  text: string | null | undefined
): string | null {
  if (!text || typeof text !== 'string') return null
  const m = text.match(
    /updated the (?:time and location|time|location) for .+? \((?:space|activity|portfolio)\)\. View details:\s*(\S+)/i
  )
  if (!m?.[1]) return null
  const path = m[1].trim()
  const space = path.match(/^\/space\/([^/?#]+)/i)
  if (space?.[1]) {
    try {
      return decodeURIComponent(space[1])
    } catch {
      return space[1]
    }
  }
  const legacy = path.match(/^\/portfolio\/activities\/([^/?#]+)/i)
  if (legacy?.[1]) {
    try {
      return decodeURIComponent(legacy[1])
    } catch {
      return legacy[1]
    }
  }
  return null
}
