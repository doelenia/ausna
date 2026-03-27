import { createClient } from '@/lib/supabase/server'
import { parsePortfolioRoute } from '@/lib/portfolio/routes'
import { Portfolio } from '@/types/portfolio'
import { notFound, redirect } from 'next/navigation'

interface MembersPageProps {
  params: {
    type: string
    id: string
  }
  searchParams?: Promise<{ tab?: string }> | { tab?: string }
}

export default async function MembersPage({ params, searchParams }: MembersPageProps) {
  const resolvedSearchParams = searchParams && typeof (searchParams as any).then === 'function'
    ? await (searchParams as Promise<{ tab?: string }>)
    : (searchParams as { tab?: string } | undefined)
  const initialTab = resolvedSearchParams?.tab === 'requests'
    ? 'requests'
    : resolvedSearchParams?.tab === 'subscribers'
      ? 'subscribers'
      : 'members'
  const { type, id, isValid } = parsePortfolioRoute(params.type, params.id)

  if (!isValid || !type) {
    notFound()
  }

  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch portfolio
  let portfolio: Portfolio | null = null

  const { data: portfolioById } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', id)
    .eq('type', type)
    .maybeSingle()

  if (portfolioById) {
    portfolio = portfolioById as Portfolio
  } else if (type === 'human') {
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

  const resolvedPortfolio = portfolio as Portfolio

  // Compatibility redirect: canonical members route is /portfolio/[idOrSlug]/members
  redirect(`/portfolio/${resolvedPortfolio.slug || resolvedPortfolio.id}/members?tab=${initialTab}`)
}

