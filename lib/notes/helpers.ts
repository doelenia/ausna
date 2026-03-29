import { createClient } from '@/lib/supabase/server'
import {
  Portfolio,
  isHumanPortfolio,
  isProjectPortfolio,
  isCommunityPortfolio,
  isActivityPortfolio,
  DB_NON_HUMAN_TYPES,
} from '@/types/portfolio'

/**
 * Check if user is a member of a portfolio (server-side)
 * For human portfolios: user is member if they own it
 * For project/community portfolios: user is member if they're in the members array or are the owner
 */
export async function isPortfolioMember(
  portfolioId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { data: portfolio, error } = await supabase
    .from('portfolios')
    .select('user_id, type, metadata')
    .eq('id', portfolioId)
    .single()

  if (error || !portfolio) {
    return false
  }

  // Owner is always a member
  if (portfolio.user_id === userId) {
    return true
  }

  // For human portfolios, only owner is member
  if (isHumanPortfolio(portfolio as Portfolio)) {
    return false
  }

  // For project/community portfolios, check members array
  const metadata = portfolio.metadata as any
  const members = metadata?.members || []
  
  return Array.isArray(members) && members.includes(userId)
}

/**
 * Check if user is the owner of a portfolio (server-side)
 */
export async function isPortfolioOwner(
  portfolioId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { data: portfolio, error } = await supabase
    .from('portfolios')
    .select('user_id')
    .eq('id', portfolioId)
    .single()

  if (error || !portfolio) {
    return false
  }

  return portfolio.user_id === userId
}

/**
 * Check if user can create a note in a portfolio
 * User must be a member or owner
 */
export async function canCreateNoteInPortfolio(
  portfolioId: string,
  userId: string
): Promise<boolean> {
  return isPortfolioMember(portfolioId, userId)
}

/**
 * Check if a user can create a "resource" note in a portfolio.
 *
 * Rules:
 * - Human portfolios: only the owner can create resources (resources are unassigned; visibility is owner-scoped).
 * - Projects/Community: only owner or manager can create resources.
 * - Activities:
 *   - external activity: owner/manager/member can create resources
 *   - non-external: only owner/manager can create resources
 */
export async function canCreateResourceInPortfolio(
  portfolioId: string,
  userId: string
): Promise<boolean> {
  if (!userId) return false

  const supabase = await createClient()

  const { data: portfolio, error } = await supabase
    .from('portfolios')
    .select('user_id, type, metadata')
    .eq('id', portfolioId)
    .single()

  if (error || !portfolio) return false

  // Owner can always create
  const isOwner = portfolio.user_id === userId
  if (isHumanPortfolio(portfolio as Portfolio)) return isOwner

  const metadata = portfolio.metadata as any
  const managers = metadata?.managers || []
  const isManager = Array.isArray(managers) && managers.includes(userId)

  if (isActivityPortfolio(portfolio as Portfolio)) {
    const properties = metadata?.properties || {}
    const isExternalActivity = properties?.external === true

    if (isExternalActivity) {
      const members = metadata?.members || []
      const isMember = Array.isArray(members) && members.includes(userId)
      return isOwner || isManager || isMember
    }

    return isOwner || isManager
  }

  // Projects/Community
  return isOwner || isManager
}

/**
 * Check if two users are friends (accepted friendship, server-side).
 *
 * IMPORTANT: `ownerId` and `userId` are always auth user IDs. This helper
 * never works with portfolio IDs; callers must convert from any human
 * portfolio to its owner user id before calling.
 */
export async function isFriend(
  ownerId: string,
  userId: string
): Promise<boolean> {
  if (!ownerId || !userId || ownerId === userId) return false
  const supabase = await createClient()
  const { data } = await supabase
    .from('friends')
    .select('id')
    .or(`and(user_id.eq.${ownerId},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${ownerId})`)
    .eq('status', 'accepted')
    .maybeSingle()
  return !!data
}

export type AnnotationPrivacy = 'everyone' | 'friends' | 'authors'

/**
 * Check if a user can annotate (comment on) a note based on the note's annotation_privacy.
 * Default: if annotation_privacy is missing, treat as 'everyone'.
 * - everyone: any authenticated user can comment
 * - friends: only friends of the note owner can comment
 * - authors: only users who can post on one of the note's assigned portfolios (project members)
 */
export async function canAnnotateNote(
  note: {
    annotation_privacy?: AnnotationPrivacy | null
    owner_account_id: string
    assigned_portfolios?: string[]
  },
  portfolios: Portfolio[] | null,
  userId: string
): Promise<boolean> {
  if (!userId) return false

  const privacy: AnnotationPrivacy = note.annotation_privacy ?? 'everyone'

  switch (privacy) {
    case 'everyone':
      return true
    case 'friends':
      return isFriend(note.owner_account_id, userId)
    case 'authors': {
      const portfolioIds = note.assigned_portfolios || []
      if (portfolioIds.length === 0) return false
      for (const portfolioId of portfolioIds) {
        if (await canCreateNoteInPortfolio(portfolioId, userId)) return true
      }
      return false
    }
    default:
      return true
  }
}

/**
 * Check if user can remove a note from a portfolio
 * Rules:
 * - Note owner can remove if they're member/owner (except from own human portfolio)
 * - Portfolio owner can remove anyone's note
 * - Cannot remove own note from own human portfolio
 */
export async function canRemoveNoteFromPortfolio(
  noteId: string,
  portfolioId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  // Get note owner
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('owner_account_id')
    .eq('id', noteId)
    .single()

  if (noteError || !note) {
    return false
  }

  const noteOwnerId = note.owner_account_id
  const isNoteOwner = noteOwnerId === userId

  // Get portfolio info
  const { data: portfolio, error: portfolioError } = await supabase
    .from('portfolios')
    .select('user_id, type')
    .eq('id', portfolioId)
    .single()

  if (portfolioError || !portfolio) {
    return false
  }

  const portfolioOwnerId = portfolio.user_id
  const isPortfolioOwner = portfolioOwnerId === userId
  const isHumanPortfolio = portfolio.type === 'human'

  // Portfolio owner can remove anyone's note
  if (isPortfolioOwner) {
    return true
  }

  // Note owner can remove if they're member/owner
  if (isNoteOwner) {
    // Cannot remove own note from own human portfolio
    if (isHumanPortfolio && portfolioOwnerId === noteOwnerId) {
      return false
    }
    
    // Can remove if they're a member/owner of the portfolio
    return isPortfolioMember(portfolioId, userId)
  }

  return false
}

/**
 * Get all portfolios where user is a member or owner
 */
export async function getUserPortfolios(userId: string): Promise<Portfolio[]> {
  const supabase = await createClient()
  
  // Get portfolios where user is owner
  const { data: ownedPortfolios, error: ownedError } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)

  if (ownedError) {
    return []
  }

  // Get all project and community portfolios
  const { data: allPortfolios, error: allError } = await supabase
    .from('portfolios')
    .select('*')
    .in('type', [...DB_NON_HUMAN_TYPES])

  if (allError) {
    return (ownedPortfolios || []) as Portfolio[]
  }

  // Filter portfolios where user is a member
  const memberPortfolios = (allPortfolios || []).filter((p: any) => {
    const metadata = p.metadata as any
    const members = metadata?.members || []
    return Array.isArray(members) && members.includes(userId)
  })

  // Combine owned and member portfolios, remove duplicates
  const allUserPortfolios = [
    ...(ownedPortfolios || []),
    ...memberPortfolios,
  ]

  // Remove duplicates by ID
  const uniquePortfolios = Array.from(
    new Map(allUserPortfolios.map((p: any) => [p.id, p])).values()
  )

  return uniquePortfolios as Portfolio[]
}

