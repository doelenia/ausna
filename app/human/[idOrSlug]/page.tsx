import { createClient } from '@/lib/supabase/server'
import { isHumanPortfolio } from '@/types/portfolio'
import {
  getCurrentUserPendingActivityRequest,
  getCurrentUserPendingCommunityRequest,
} from '@/app/portfolio/[idOrSlug]/actions'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import { PortfolioView } from '@/components/portfolio/PortfolioView'
import { getTopInterestedTopics } from '@/lib/indexing/interest-tracking'
import { checkAdmin } from '@/lib/auth/requireAdmin'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getHumanProfileUrl, getSpaceUrl } from '@/lib/portfolio/routes'

interface HumanPortfolioPageProps {
  params: { idOrSlug: string }
}

export default async function HumanPortfolioPage({ params }: HumanPortfolioPageProps) {
  const idOrSlug = params.idOrSlug
  if (!idOrSlug || typeof idOrSlug !== 'string') notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const portfolio = await loadPortfolioForPage(supabase, idOrSlug)
  if (!portfolio) notFound()

  if (!isHumanPortfolio(portfolio)) {
    permanentRedirect(getSpaceUrl(portfolio.slug || portfolio.id))
  }

  if (portfolio.slug && portfolio.slug !== idOrSlug) {
    permanentRedirect(getHumanProfileUrl(portfolio.slug))
  }

  const isOwner = user ? portfolio.user_id === user.id : false
  const basic = getPortfolioBasic(portfolio)

  let topInterests: Array<{ topic: any; memory_score: number; aggregate_score: number }> = []
  try {
    topInterests = await getTopInterestedTopics(portfolio.user_id, 5)
  } catch (error) {
    console.error('Failed to fetch top interests:', error)
  }

  const adminUser = await checkAdmin()
  const isAdmin = adminUser !== null

  return (
    <PortfolioView
      portfolio={portfolio}
      basic={basic}
      isOwner={isOwner}
      currentUserId={user?.id}
      topInterests={topInterests}
      isAdmin={isAdmin}
      hasPendingApplication={false}
      hasPendingCommunityApplication={false}
    />
  )
}
