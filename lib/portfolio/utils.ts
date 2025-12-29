/**
 * Pure utility functions for portfolios
 * These functions don't require server-side code and can be used in client components
 */

import { Portfolio } from '@/types/portfolio'

/**
 * Extract basic metadata from portfolio
 */
export function getPortfolioBasic(portfolio: Portfolio): {
  name: string
  description?: string
  avatar?: string
} {
  const metadata = portfolio.metadata as any
  const basic = metadata?.basic || {}
  
  return {
    name: basic.name || 'Untitled',
    description: basic.description,
    avatar: basic.avatar,
  }
}

/**
 * Generate slug from name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

