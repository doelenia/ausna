import { Json } from './supabase'
import type { ActivityLocationValue } from '@/lib/location'

export type PortfolioVisibility = 'public' | 'private'

/**
 * Canonical portfolio discriminator: person profile vs shared space.
 * Legacy DB values (`portfolio`, `community`, `activities`, `projects`) normalize to `space`.
 */
export type PortfolioType = 'human' | 'space'

/** Values that may appear on `portfolios.type` from the database */
export type DbPortfolioType = PortfolioType

/**
 * Legacy DB non-human subtype values are no longer expected after the backfill
 * that normalizes non-human portfolios to `type = 'space'`.
 */
export type LegacyNonHumanPortfolioType = never

export function normalizePortfolioType(
  type: string | null | undefined
): PortfolioType | null {
  if (!type) return null
  const t = String(type).toLowerCase()
  if (t === 'human') return 'human'
  if (
    t === 'portfolio' ||
    t === 'space' ||
    t === 'projects' ||
    t === 'community' ||
    t === 'activities'
  ) {
    return 'space'
  }
  return null
}

/**
 * DB `type` values that mean non-human (for Supabase `.in('type', …)`).
 * After `migrations/20260329_non_human_portfolios_to_space.sql` (or equivalent backfill),
 * rows are expected to be `space` only.
 */
export const DB_NON_HUMAN_TYPES: readonly string[] = ['space']

/**
 * Basic metadata fields shared by all portfolios
 */
export interface PortfolioBasicMetadata {
  name: string
  description?: string
  avatar?: string // URL to storage bucket (for projects/community, emoji is required if no avatar)
  emoji?: string // Emoji for projects/community when no image avatar is provided
}

/**
 * Pinned item: link to another space portfolio or a note.
 * Stored `type` may be legacy `"portfolio"`; use `normalizePinnedItemType`.
 */
export interface PinnedItem {
  type: 'space' | 'note' | 'portfolio'
  id: string
}

export function normalizePinnedItemType(
  t: string | null | undefined
): 'space' | 'note' | null {
  if (!t) return null
  const s = String(t).toLowerCase()
  if (s === 'note') return 'note'
  if (s === 'space' || s === 'portfolio') return 'space'
  return null
}

/**
 * Base metadata structure for all portfolios
 */
export interface PortfolioMetadata {
  basic: PortfolioBasicMetadata
  pinned: PinnedItem[] // Array of pinned items (max 9)
  settings: Record<string, any> // Empty for now, reserved for future use
}

/**
 * Structured weekly availability for human portfolios
 * Times are simple local-time strings in HH:MM format (e.g. "09:00").
 */
export interface HumanAvailabilityDay {
  enabled: boolean
  startTime?: string
  endTime?: string
}

export interface HumanAvailabilitySchedule {
  monday?: HumanAvailabilityDay
  tuesday?: HumanAvailabilityDay
  wednesday?: HumanAvailabilityDay
  thursday?: HumanAvailabilityDay
  friday?: HumanAvailabilityDay
  saturday?: HumanAvailabilityDay
  sunday?: HumanAvailabilityDay
}

/**
 * Human portfolio properties template
 */
export interface HumanPortfolioProperties {
  current_location?: string
  availability?: string
  social_preferences?: string
  preferred_contact_method?: string
  /**
   * Structured weekly availability used by the editor UI.
   * Kept separate from the legacy string `availability` field.
   */
  availability_schedule?: HumanAvailabilitySchedule
  /**
   * Automatically derived coarse location (typically city/region/country)
   * based on the user's IP address. Updated at most once per day.
   */
  auto_city_location?: ActivityLocationValue
  /**
   * When false, we stop updating and showing `auto_city_location`.
   * Defaults to true when unset.
   */
  auto_city_location_enabled?: boolean
  /**
   * ISO timestamp of the last successful auto-city-location update.
   */
  auto_city_location_last_updated_at?: string
}

/**
 * Onboarding state stored in human portfolio metadata
 */
export interface HumanPortfolioOnboarding {
  profile_complete?: boolean
  availabilities_complete?: boolean
  join_community_seen?: boolean
  open_calls_setup_complete?: boolean
  updated_at?: string
}

/**
 * Human portfolio metadata
 */
export interface HumanPortfolioMetadata extends PortfolioMetadata {
  username?: string // Keep for backward compatibility
  email?: string // Email address for the human portfolio
  onboarding?: HumanPortfolioOnboarding
  skills?: string[]
  experience?: Array<{
    title: string
    company?: string
    duration?: string
    description?: string
  }>
  education?: Array<{
    degree: string
    institution: string
    year?: string
  }>
  location?: string
  availability?: string
  owned_projects?: string[] // Array of project portfolio IDs, ordered by most recent activity (most recent first)
  joined_community?: string // Space portfolio ID that this human has joined
  properties?: HumanPortfolioProperties
  [key: string]: any
}

/**
 * Project portfolio ask item
 */
export interface ProjectPortfolioAsk {
  title: string
  description: string
}

/**
 * Project portfolio properties template
 */
export interface PortfolioProperties {
  goals?: string
  timelines?: string
  asks?: ProjectPortfolioAsk[]
  activity_datetime?: {
    start: string
    end?: string | null
    inProgress?: boolean
    allDay?: boolean
  }
  location?: ActivityLocationValue
  /**
   * Optional call-to-join configuration controlling how non-members can apply
   * to join this portfolio.
   *
   * Note: historically activities supported this first; we now allow any
   * non-human portfolio to use the same model.
   */
  call_to_join?: ActivityCallToJoinConfig
  /** When true, this portfolio represents an external item linked elsewhere. */
  external?: boolean
  /** URL to the external item (when external is true). */
  external_link?: string
}

// Backward compatible alias (avoid churn elsewhere while refactoring)
export type ProjectPortfolioProperties = PortfolioProperties

export interface ActivityCallToJoinRoleOption {
  id: string
  label: string
  /**
   * Internal membership role this option maps to for activities.
   * Typically 'member' or 'manager', but kept as string for forward compatibility.
   */
  activityRole: string
}

export interface ActivityCallToJoinConfig {
  enabled: boolean
  description?: string
  /**
   * ISO datetime in UTC after which new applications are closed.
   */
  join_by?: string | null
  /**
   * Whether applications require explicit approval by owner/manager.
   */
  require_approval: boolean
  /**
   * Optional question shown to applicants when require_approval is true.
   */
  prompt?: string | null
  /**
   * Role options applicants can choose from when applying.
   */
  roles?: ActivityCallToJoinRoleOption[]
  /**
   * If true, the system may auto-adjust join_by when the activity end datetime changes.
   * Once a user explicitly edits the join_by value, this should be set to false.
   */
  join_by_auto_managed?: boolean
}

/**
 * Activity portfolio properties template
 * Mirrors ProjectPortfolioProperties so activities can carry their own
 * goals, asks, and scheduling/location information.
 */
export interface ActivityPortfolioProperties extends PortfolioProperties {
  /** Legacy: host references (kept until DB migration removes activity concept). */
  host_project_ids?: string[]
  host_community_ids?: string[]
}

/**
 * Project portfolio metadata
 */
export interface PortfolioEntityMetadata extends PortfolioMetadata {
  members: string[] // Array of user IDs (includes owner)
  managers: string[] // Array of user IDs (managers can edit, manage pinned, etc.)
  project_type_general?: string // General category (e.g., "Arts & Culture")
  project_type_specific?: string // Specific type (e.g., "Film", max 2 words)
  memberRoles?: { [userId: string]: string } // Object mapping userId to role (max 2 words)
  technologies?: string[]
  github_url?: string
  live_url?: string
  status?: 'idea' | 'live' | 'in-progress' | 'completed' | 'archived'
  collaborators?: string[]
  start_date?: string
  end_date?: string
  properties?: PortfolioProperties
  [key: string]: any
}

/**
 * Community portfolio metadata
 */
// Backward compatible aliases
export type ProjectPortfolioMetadata = PortfolioEntityMetadata
export type CommunityPortfolioMetadata = PortfolioEntityMetadata
export type ActivityPortfolioMetadata = PortfolioEntityMetadata

/**
 * Base portfolio interface - common fields for all portfolio types
 */
export interface BasePortfolio {
  id: string
  type: DbPortfolioType
  slug: string
  user_id: string
  host_project_id?: string | null
  created_at: string
  updated_at: string
  metadata: Json
  is_pseudo?: boolean // If true, portfolio is hidden from customer search but visible to admins (defaults to false in DB)
  visibility?: PortfolioVisibility // DB default is 'public'; 'private' portfolios are only visible to their owner and admins
}

/**
 * Type-specific portfolio interfaces
 */
export interface HumanPortfolio extends BasePortfolio {
  type: 'human'
  metadata: HumanPortfolioMetadata
}

export interface PortfolioEntity extends BasePortfolio {
  type: 'space'
  metadata: PortfolioEntityMetadata
}

/**
 * Union type for all portfolio types
 */
export type Portfolio = HumanPortfolio | PortfolioEntity

/**
 * Type guard functions
 */
export function isHumanPortfolio(portfolio: Portfolio): portfolio is HumanPortfolio {
  return normalizePortfolioType(portfolio.type) === 'human'
}

/** Non-human portfolio (shared space). */
export function isSpacePortfolio(portfolio: Portfolio): portfolio is PortfolioEntity {
  return normalizePortfolioType(portfolio.type) === 'space'
}

/** @deprecated Use isSpacePortfolio */
export function isPortfolioEntity(portfolio: Portfolio): portfolio is PortfolioEntity {
  return isSpacePortfolio(portfolio)
}

// ---------------------------------------------------------------------------
// Backward compatible type guards (non-human = space)
// ---------------------------------------------------------------------------
export function isProjectPortfolio(portfolio: Portfolio): portfolio is PortfolioEntity {
  return isSpacePortfolio(portfolio)
}

export function isActivityPortfolio(portfolio: Portfolio): portfolio is PortfolioEntity {
  return isSpacePortfolio(portfolio)
}

export function isCommunityPortfolio(portfolio: Portfolio): portfolio is PortfolioEntity {
  return isSpacePortfolio(portfolio)
}

/**
 * Portfolio creation input type
 */
export interface CreatePortfolioInput {
  type: 'space'
  name: string
  avatar?: string // Optional avatar URL
}

/**
 * Portfolio update input type
 */
export interface UpdatePortfolioInput {
  name?: string
  description?: string
  avatar?: string
  metadata?: Partial<Json>
}

/**
 * Portfolio search/filter options
 */
export interface PortfolioSearchOptions {
  type?: PortfolioType | PortfolioType[]
  query?: string
  user_id?: string
  limit?: number
  offset?: number
  order_by?: 'created_at' | 'updated_at' | 'name'
  order?: 'asc' | 'desc'
}
