/**
 * Portfolio routing utilities
 * Provides type-safe routing helpers for portfolio pages
 */

import { PortfolioType } from '@/types/portfolio'

/**
 * Generate portfolio URL.
 *
 * Canonical URLs no longer include the portfolio type segment.
 */
export function getPortfolioUrl(idOrSlug: string): string
export function getPortfolioUrl(type: PortfolioType, idOrSlug: string): string
export function getPortfolioUrl(
  typeOrId: PortfolioType | string,
  idMaybe?: string
): string {
  if (typeof idMaybe === 'string') {
    // Legacy typed URLs (kept for backward compatibility; these redirect).
    return `/portfolio/${typeOrId}/${idMaybe}`
  }
  return `/portfolio/${typeOrId}`
}

/**
 * Generate portfolio URL with slug (for SEO-friendly URLs)
 */
export function getPortfolioUrlWithSlug(type: PortfolioType, slug: string): string {
  // Legacy typed URL with slug (kept for backward compatibility; these redirect).
  return `/portfolio/${type}/${slug}`
}

/**
 * Parse portfolio route parameters
 */
export function parsePortfolioRoute(
  type: string | undefined,
  id: string | undefined
): { type: PortfolioType | null; id: string | null; isValid: boolean } {
  const validTypes: PortfolioType[] = ['human', 'portfolio']
  
  if (!type || !id) {
    return { type: null, id: null, isValid: false }
  }

  const normalizedType = type.toLowerCase() as PortfolioType
  const isValid = validTypes.includes(normalizedType)

  return {
    type: isValid ? normalizedType : null,
    id,
    isValid,
  }
}

/**
 * Validate portfolio type
 */
export function isValidPortfolioType(type: string): type is PortfolioType {
  const validTypes: PortfolioType[] = ['human', 'portfolio']
  return validTypes.includes(type.toLowerCase() as PortfolioType)
}

/**
 * Get all valid portfolio types
 */
export function getPortfolioTypes(): PortfolioType[] {
  return ['human', 'portfolio']
}

/**
 * Get portfolio type display name
 */
export function getPortfolioTypeDisplayName(type: PortfolioType): string {
  const displayNames: Record<PortfolioType, string> = {
    human: 'Human',
    portfolio: 'Portfolio',
  }
  return displayNames[type]
}

