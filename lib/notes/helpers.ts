import { createClient } from '@/lib/supabase/server'
import { Portfolio, isHumanPortfolio, isProjectPortfolio, isCommunityPortfolio } from '@/types/portfolio'

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
    .in('type', ['projects', 'community'])

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

