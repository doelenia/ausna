import { createClient } from '@/lib/supabase/server'
import { parsePortfolioRoute } from '@/lib/portfolio/routes'
import { Portfolio, isHumanPortfolio } from '@/types/portfolio'
import { notFound } from 'next/navigation'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import { PortfolioAllView } from '@/components/portfolio/PortfolioAllView'
import { canCreateNoteInPortfolio } from '@/lib/notes/helpers'

interface PortfolioAllPageProps {
  params: {
    type: string
    id: string
  }
}

export default async function PortfolioAllPage({ params }: PortfolioAllPageProps) {
  const { type, id, isValid } = parsePortfolioRoute(params.type, params.id)

  if (!isValid || !type) {
    notFound()
  }

  const supabase = await createClient()

  // Get current user for ownership check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch portfolio by ID, slug, or user_id (for human portfolios)
  let portfolio: Portfolio | null = null
  let errorBySlug: { message?: string } | null = null

  // Try fetching by ID first
  const { data: portfolioById, error: errorById } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', id)
    .eq('type', type)
    .maybeSingle()

  if (portfolioById) {
    portfolio = portfolioById as Portfolio
  } else if (type === 'human') {
    // For human portfolios, also try fetching by user_id
    const { data: portfolioByUserId, error: errorByUserId } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', id)
      .eq('type', 'human')
      .maybeSingle()

    if (portfolioByUserId) {
      portfolio = portfolioByUserId as Portfolio
    }
  }

  if (!portfolio) {
    // Try fetching by slug as last resort
    const { data: portfolioBySlug, error: slugError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('slug', id)
      .eq('type', type)
      .maybeSingle()

    errorBySlug = slugError
    if (portfolioBySlug) {
      portfolio = portfolioBySlug as Portfolio
    }
  }

  if (!portfolio) {
    notFound()
  }

  // Check if user is owner
  const isOwner = user ? portfolio.user_id === user.id : false

  // Check if user can create notes
  const userCanCreateNote = user
    ? await canCreateNoteInPortfolio(portfolio.id, user.id)
    : false

  // Extract basic info
  const basic = getPortfolioBasic(portfolio)

  // Determine tab label based on portfolio type
  const tabLabel = isHumanPortfolio(portfolio) ? 'Involvement' : 'Navigations'

  return (
    <PortfolioAllView
      portfolio={portfolio}
      basic={basic}
      isOwner={isOwner}
      currentUserId={user?.id}
      tabLabel={tabLabel}
      canCreateNote={userCanCreateNote}
    />
  )
}

