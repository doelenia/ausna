/**
 * Human / Space routing — canonical URLs under /human and /space.
 */

import type { Portfolio } from '@/types/portfolio'
import {
  isHumanPortfolio,
  normalizePortfolioType,
  type PortfolioType,
} from '@/types/portfolio'

const LEGACY_PREFIX = '/portfolio'

export function getHumanProfileUrl(idOrSlug: string): string {
  return `/human/${encodeURIComponent(idOrSlug)}`
}

export function getHumanFriendsUrl(idOrSlug: string): string {
  return `/human/${encodeURIComponent(idOrSlug)}/friends`
}

export function getHumanCommunitiesUrl(idOrSlug: string): string {
  return `/human/${encodeURIComponent(idOrSlug)}/communities`
}

export function getHumanPinnedUrl(idOrSlug: string): string {
  return `/human/${encodeURIComponent(idOrSlug)}/pinned`
}

export function getSpaceUrl(idOrSlug: string): string {
  return `/space/${encodeURIComponent(idOrSlug)}`
}

export function getSpaceMembersUrl(idOrSlug: string, query?: string): string {
  const base = `/space/${encodeURIComponent(idOrSlug)}/members`
  return query ? `${base}?${query.replace(/^\?/, '')}` : base
}

export function getSpacePinnedUrl(idOrSlug: string): string {
  return `/space/${encodeURIComponent(idOrSlug)}/pinned`
}

export function getSpaceCreateUrl(): string {
  return '/space/create'
}

/**
 * Canonical URL for a portfolio row (human profile vs space).
 */
export function getPortfolioUrl(portfolio: Pick<Portfolio, 'type' | 'slug' | 'id'>): string {
  const idOrSlug = portfolio.slug || portfolio.id
  if (isHumanPortfolio(portfolio as Portfolio)) {
    return getHumanProfileUrl(idOrSlug)
  }
  return getSpaceUrl(idOrSlug)
}

/** Assigned non-human portfolio in emails — always a space URL. */
export function getSpaceUrlById(portfolioId: string): string {
  return getSpaceUrl(portfolioId)
}

/**
 * @deprecated Prefer `getPortfolioUrl(portfolio)` or human/space helpers. Kept for narrow legacy call sites.
 */
export function getPortfolioUrlLegacy(idOrSlug: string): string {
  return `${LEGACY_PREFIX}/${idOrSlug}`
}

export function getPortfolioUrlWithSlug(_type: PortfolioType, slug: string): string {
  return getSpaceUrl(slug)
}

export function parsePortfolioRoute(
  type: string | undefined,
  id: string | undefined
): { type: PortfolioType | null; id: string | null; isValid: boolean } {
  if (!type || !id) {
    return { type: null, id: null, isValid: false }
  }

  const normalizedType = normalizePortfolioType(type)
  const isValid = normalizedType !== null

  return {
    type: normalizedType,
    id,
    isValid,
  }
}

export function isValidPortfolioType(type: string): type is PortfolioType {
  return normalizePortfolioType(type) !== null
}

export function getPortfolioTypes(): PortfolioType[] {
  return ['human', 'space']
}

export function getPortfolioTypeDisplayName(type: PortfolioType): string {
  const displayNames: Record<PortfolioType, string> = {
    human: 'Human',
    space: 'Space',
  }
  return displayNames[type]
}
