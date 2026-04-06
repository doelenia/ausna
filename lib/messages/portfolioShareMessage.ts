import type { Portfolio } from '@/types/portfolio'
import { normalizePortfolioType } from '@/types/portfolio'

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * Parses type + id/slug from "Shared a portfolio. View details: …" DM text.
 * Supports canonical `/human/…`, `/space/…`, and legacy `/portfolio/{type}/…`.
 */
export function parsePortfolioShareFromMessage(
  text: string | null | undefined
): { portfolioType: Portfolio['type']; portfolioIdentifier: string } | null {
  if (!text || typeof text !== 'string') return null
  const m = text.match(/View details:\s*(\S+)/i)
  if (!m?.[1]) return null
  const path = m[1].trim()

  const human = path.match(/^\/human\/([^/?#]+)/i)
  if (human?.[1]) {
    return {
      portfolioType: 'human',
      portfolioIdentifier: decodePathSegment(human[1]),
    }
  }

  const space = path.match(/^\/space\/([^/?#]+)/i)
  if (space?.[1]) {
    return {
      portfolioType: 'space',
      portfolioIdentifier: decodePathSegment(space[1]),
    }
  }

  const legacy = path.match(/^\/portfolio\/([a-z-]+)\/([^/?#]+)/i)
  if (legacy?.[1] && legacy[2]) {
    const normalized = normalizePortfolioType(legacy[1])
    if (!normalized) return null
    return {
      portfolioType: normalized,
      portfolioIdentifier: decodePathSegment(legacy[2]),
    }
  }

  return null
}
