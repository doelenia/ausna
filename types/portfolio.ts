import { Json } from './supabase'

/**
 * Base portfolio types that all portfolio types extend
 */
export type PortfolioType = 'human' | 'projects' | 'community'

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
 * Pinned item structure
 */
export interface PinnedItem {
  type: 'portfolio' | 'note'
  id: string
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
 * Human portfolio properties template
 */
export interface HumanPortfolioProperties {
  current_location?: string
  availability?: string
  social_preferences?: string
  preferred_contact_method?: string
}

/**
 * Human portfolio metadata
 */
export interface HumanPortfolioMetadata extends PortfolioMetadata {
  username?: string // Keep for backward compatibility
  email?: string // Email address for the human portfolio
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
  joined_community?: string // Community portfolio ID that this human has joined
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
export interface ProjectPortfolioProperties {
  goals?: string
  timelines?: string
  asks?: ProjectPortfolioAsk[]
}

/**
 * Project portfolio metadata
 */
export interface ProjectPortfolioMetadata extends PortfolioMetadata {
  members: string[] // Array of user IDs (includes owner)
  managers: string[] // Array of user IDs (managers can edit, manage pinned, etc.)
  project_type_general?: string // General category (e.g., "Arts & Culture")
  project_type_specific?: string // Specific type (e.g., "Film", max 2 words)
  memberRoles?: { [userId: string]: string } // Object mapping userId to role (max 2 words)
  technologies?: string[]
  github_url?: string
  live_url?: string
  status?: 'idea' | 'in-progress' | 'completed' | 'archived'
  collaborators?: string[]
  start_date?: string
  end_date?: string
  properties?: ProjectPortfolioProperties
  [key: string]: any
}

/**
 * Community portfolio metadata
 */
export interface CommunityPortfolioMetadata extends PortfolioMetadata {
  members: string[] // Array of user IDs (includes owner)
  managers: string[] // Array of user IDs (managers can edit, manage pinned, etc.)
  project_type_general?: string // General category (e.g., "Arts & Culture")
  project_type_specific?: string // Specific type (e.g., "Film", max 2 words)
  memberRoles?: { [userId: string]: string } // Object mapping userId to role (max 2 words)
  topic_tags?: string[]
  category?: string
  related_projects?: string[] // portfolio IDs
  related_humans?: string[] // user IDs
  community_type?: 'question' | 'idea' | 'collaboration' | 'feedback'
  [key: string]: any
}

/**
 * Base portfolio interface - common fields for all portfolio types
 */
export interface BasePortfolio {
  id: string
  type: PortfolioType
  slug: string
  user_id: string
  created_at: string
  updated_at: string
  metadata: Json
  is_pseudo?: boolean // If true, portfolio is hidden from customer search but visible to admins (defaults to false in DB)
}

/**
 * Type-specific portfolio interfaces
 */
export interface HumanPortfolio extends BasePortfolio {
  type: 'human'
  metadata: HumanPortfolioMetadata
}

export interface ProjectPortfolio extends BasePortfolio {
  type: 'projects'
  metadata: ProjectPortfolioMetadata
}

export interface CommunityPortfolio extends BasePortfolio {
  type: 'community'
  metadata: CommunityPortfolioMetadata
}

/**
 * Union type for all portfolio types
 */
export type Portfolio = HumanPortfolio | ProjectPortfolio | CommunityPortfolio

/**
 * Type guard functions
 */
export function isHumanPortfolio(portfolio: Portfolio): portfolio is HumanPortfolio {
  return portfolio.type === 'human'
}

export function isProjectPortfolio(portfolio: Portfolio): portfolio is ProjectPortfolio {
  return portfolio.type === 'projects'
}

export function isCommunityPortfolio(portfolio: Portfolio): portfolio is CommunityPortfolio {
  return portfolio.type === 'community'
}

/**
 * Portfolio creation input type
 */
export interface CreatePortfolioInput {
  type: 'projects' | 'community' // Only projects and communities can be created
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

