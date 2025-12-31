import { createClient } from '@/lib/supabase/server'
import { parsePortfolioRoute } from '@/lib/portfolio/routes'
import { Portfolio, isProjectPortfolio, isCommunityPortfolio, isHumanPortfolio } from '@/types/portfolio'
import { notFound } from 'next/navigation'
import { getPortfolioBasic, isPortfolioOwner } from '@/lib/portfolio/helpers'
import { PortfolioView } from '@/components/portfolio/PortfolioView'
import { getTopInterestedTopics } from '@/lib/indexing/interest-tracking'
import Link from 'next/link'

interface PortfolioPageProps {
  params: {
    type: string
    id: string
  }
}

export default async function PortfolioPage({ params }: PortfolioPageProps) {
  const { type, id, isValid } = parsePortfolioRoute(params.type, params.id)

  if (!isValid || !type) {
    notFound()
  }

  const supabase = await createClient()

  // Get current user for ownership check
  // This will refresh the session if needed (middleware already refreshed it)
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
    // This allows URLs like /portfolio/human/{user_id}
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
    // Log errors for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.error('Portfolio not found:', {
        type,
        id,
        errorById: errorById?.message,
        errorBySlug: errorBySlug?.message,
      })
      // Try to fetch all portfolios of this type to see what's available
      const { data: allPortfolios } = await supabase
        .from('portfolios')
        .select('id, type, slug')
        .eq('type', type)
        .limit(10)
      console.log('Available portfolios of type', type, ':', allPortfolios)
    }
    notFound()
  }

  // Check if user is owner - simple comparison (more reliable than separate query)
  // Compare portfolio.user_id with authenticated user.id
  const isOwner = user ? portfolio.user_id === user.id : false

  // Extract basic info
  const basic = getPortfolioBasic(portfolio)

  // Fetch top 5 interested topics for human portfolios
  let topInterests: Array<{ topic: any; memory_score: number; aggregate_score: number }> = []
  if (isHumanPortfolio(portfolio)) {
    try {
      topInterests = await getTopInterestedTopics(portfolio.user_id, 5)
    } catch (error) {
      console.error('Failed to fetch top interests:', error)
    }
  }

  return (
    <PortfolioView
      portfolio={portfolio}
      basic={basic}
      isOwner={isOwner}
      currentUserId={user?.id}
      topInterests={topInterests}
    />
  )
}

