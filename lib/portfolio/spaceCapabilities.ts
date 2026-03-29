import type { Portfolio } from '@/types/portfolio'
import { normalizePortfolioType } from '@/types/portfolio'
import type { Json } from '@/types/supabase'

export interface SpaceCapabilities {
  hasActivitySchedule: boolean
  hasCallToJoin: boolean
  isExternal: boolean
  hasHostSpaces: boolean
  displayCategory: {
    general?: string
    specific?: string
  }
}

/**
 * Derive feature flags for a non-human portfolio from metadata.
 * Returns null for human profiles (no space capabilities).
 */
export function deriveSpaceCapabilities(
  portfolio: Pick<Portfolio, 'type' | 'metadata'>
): SpaceCapabilities | null {
  if (normalizePortfolioType(portfolio.type) === 'human') {
    return null
  }

  const metadata = portfolio.metadata as Record<string, unknown> | null | undefined
  const props = (metadata?.properties as Record<string, unknown> | undefined) || {}
  const hostProjectIds = props.host_project_ids
  const hostCommunityIds = props.host_community_ids
  const hasHostProjects = Array.isArray(hostProjectIds) && hostProjectIds.length > 0
  const hasHostCommunities = Array.isArray(hostCommunityIds) && hostCommunityIds.length > 0
  const callToJoin = props.call_to_join as { enabled?: boolean } | undefined

  return {
    hasActivitySchedule: Boolean(
      (props.activity_datetime as { start?: string } | undefined)?.start
    ),
    hasCallToJoin: Boolean(callToJoin?.enabled),
    isExternal: Boolean(props.external),
    hasHostSpaces: hasHostProjects || hasHostCommunities,
    displayCategory: {
      general: metadata?.project_type_general as string | undefined,
      specific: metadata?.project_type_specific as string | undefined,
    },
  }
}

/** Same as deriveSpaceCapabilities but accepts loose JSON metadata (e.g. from search rows). */
export function deriveSpaceCapabilitiesFromJson(
  type: string | null | undefined,
  metadata: Json | null | undefined
): SpaceCapabilities | null {
  return deriveSpaceCapabilities({
    type: type as Portfolio['type'],
    metadata: metadata ?? {},
  } as Pick<Portfolio, 'type' | 'metadata'>)
}

/**
 * Onboarding / discovery: space is "joinable" when call-to-join is on, portfolio is public, not pseudo.
 */
export function isJoinablePublicSpaceRow(
  type: string | null | undefined,
  metadata: Json | null | undefined,
  visibility?: string | null,
  isPseudo?: boolean | null
): boolean {
  if (normalizePortfolioType(type) !== 'space') return false
  if (visibility === 'private') return false
  if (isPseudo === true) return false
  const caps = deriveSpaceCapabilitiesFromJson(type, metadata)
  return caps?.hasCallToJoin === true
}
