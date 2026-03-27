import { createClient } from '@/lib/supabase/server'
import { Portfolio, isCommunityPortfolio, isHumanPortfolio } from '@/types/portfolio'
import { getCurrentUserPendingActivityRequest, getCurrentUserPendingCommunityRequest } from '@/app/portfolio/[type]/[id]/actions'
import { notFound, redirect } from 'next/navigation'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import { PortfolioView } from '@/components/portfolio/PortfolioView'
import { getTopInterestedTopics } from '@/lib/indexing/interest-tracking'
import { checkAdmin } from '@/lib/auth/requireAdmin'

interface PortfolioPageProps {
  params: {
    type: string
  }
}

export default async function PortfolioCanonicalPage({ params }: PortfolioPageProps) {
  const idOrSlug = params.type

  if (!idOrSlug || typeof idOrSlug !== 'string') {
    notFound()
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let portfolio: Portfolio | null = null

  // 1) Try fetch by id
  const { data: byId } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', idOrSlug)
    .maybeSingle()

  if (byId) {
    portfolio = byId as Portfolio
  }

  // 2) Try fetch by slug
  if (!portfolio) {
    const { data: bySlug } = await supabase
      .from('portfolios')
      .select('*')
      .eq('slug', idOrSlug)
      .maybeSingle()

    if (bySlug) {
      portfolio = bySlug as Portfolio
    }
  }

  // 3) Human portfolio fallback: allow /portfolio/{user_id}
  if (!portfolio) {
    const { data: byUserId } = await supabase
      .from('portfolios')
      .select('*')
      .eq('type', 'human')
      .eq('user_id', idOrSlug)
      .maybeSingle()

    if (byUserId) {
      portfolio = byUserId as Portfolio
    }
  }

  if (!portfolio) {
    notFound()
  }

  // Canonicalize visible URL to slug where available
  if (portfolio.slug && portfolio.slug !== idOrSlug) {
    redirect(`/portfolio/${portfolio.slug}`)
  }

  const isOwner = user ? portfolio.user_id === user.id : false
  const basic = getPortfolioBasic(portfolio)

  let topInterests: Array<{ topic: any; memory_score: number; aggregate_score: number }> = []
  if (isHumanPortfolio(portfolio)) {
    try {
      topInterests = await getTopInterestedTopics(portfolio.user_id, 5)
    } catch (error) {
      console.error('Failed to fetch top interests:', error)
    }
  }

  const adminUser = await checkAdmin()
  const isAdmin = adminUser !== null

  let hasPendingApplication = false
  if (user && portfolio.type !== 'human') {
    const hasCallToJoin = !!((portfolio.metadata as any)?.properties?.call_to_join)
    if (hasCallToJoin) {
      const res = await getCurrentUserPendingActivityRequest(portfolio.id)
      if (res.success && res.hasPending) hasPendingApplication = true
    }
  }

  let hasPendingCommunityApplication = false
  if (user && isCommunityPortfolio(portfolio)) {
    const res = await getCurrentUserPendingCommunityRequest(portfolio.id)
    if (res.success && res.hasPending) hasPendingCommunityApplication = true
  }

  return (
    <PortfolioView
      portfolio={portfolio}
      basic={basic}
      isOwner={isOwner}
      currentUserId={user?.id}
      topInterests={topInterests}
      isAdmin={isAdmin}
      hasPendingApplication={hasPendingApplication}
      hasPendingCommunityApplication={hasPendingCommunityApplication}
    />
  )
}

