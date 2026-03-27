import { createClient } from '@/lib/supabase/server'
import { parsePortfolioRoute } from '@/lib/portfolio/routes'
import { Portfolio } from '@/types/portfolio'
import { notFound, redirect } from 'next/navigation'

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

  // Fetch portfolio by ID, slug, or user_id (for human portfolios)
  let portfolio: Portfolio | null = null

  // Try fetching by ID first
  const { data: portfolioById } = await supabase
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
    const { data: portfolioByUserId } = await supabase
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
    const { data: portfolioBySlug } = await supabase
      .from('portfolios')
      .select('*')
      .eq('slug', id)
      .eq('type', type)
      .maybeSingle()

    if (portfolioBySlug) {
      portfolio = portfolioBySlug as Portfolio
    }
  }

  if (!portfolio) {
    notFound()
  }

  // Compatibility redirect: canonical URL is now /portfolio/[idOrSlug]
  redirect(`/portfolio/${portfolio.slug || portfolio.id}`)
}

