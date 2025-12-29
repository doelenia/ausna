/**
 * Portfolio routing utilities
 * Provides type-safe routing helpers for portfolio pages
 */

import { PortfolioType } from '@/types/portfolio'

/**
 * Generate portfolio URL
 */
export function getPortfolioUrl(type: PortfolioType, id: string): string {
  return `/portfolio/${type}/${id}`
}

/**
 * Generate portfolio URL with slug (for SEO-friendly URLs)
 */
export function getPortfolioUrlWithSlug(type: PortfolioType, slug: string): string {
  return `/portfolio/${type}/${slug}`
}

/**
 * Parse portfolio route parameters
 */
export function parsePortfolioRoute(
  type: string | undefined,
  id: string | undefined
): { type: PortfolioType | null; id: string | null; isValid: boolean } {
  const validTypes: PortfolioType[] = ['human', 'projects', 'discussion']
  
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
  const validTypes: PortfolioType[] = ['human', 'projects', 'discussion']
  return validTypes.includes(type.toLowerCase() as PortfolioType)
}

/**
 * Get all valid portfolio types
 */
export function getPortfolioTypes(): PortfolioType[] {
  return ['human', 'projects', 'discussion']
}

/**
 * Get portfolio type display name
 */
export function getPortfolioTypeDisplayName(type: PortfolioType): string {
  const displayNames: Record<PortfolioType, string> = {
    human: 'Human',
    projects: 'Projects',
    discussion: 'Discussion',
  }
  return displayNames[type]
}

