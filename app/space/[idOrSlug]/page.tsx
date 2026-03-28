import { createClient } from '@/lib/supabase/server'
import { isHumanPortfolio } from '@/types/portfolio'
import {
  getCurrentUserPendingActivityRequest,
  getCurrentUserPendingCommunityRequest,
} from '@/app/portfolio/[idOrSlug]/actions'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import { PortfolioView } from '@/components/portfolio/PortfolioView'
import { checkAdmin } from '@/lib/auth/requireAdmin'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getHumanProfileUrl, getSpaceUrl } from '@/lib/portfolio/routes'

interface SpacePortfolioPageProps {
  params: { idOrSlug: string }
}

export default async function SpacePortfolioPage({ params }: SpacePortfolioPageProps) {
  const idOrSlug = params.idOrSlug
  if (!idOrSlug || typeof idOrSlug !== 'string') notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const portfolio = await loadPortfolioForPage(supabase, idOrSlug)
  if (!portfolio) notFound()

  if (isHumanPortfolio(portfolio)) {
    permanentRedirect(getHumanProfileUrl(portfolio.slug || portfolio.id))
  }

  if (portfolio.slug && portfolio.slug !== idOrSlug) {
    permanentRedirect(getSpaceUrl(portfolio.slug))
  }

  const isOwner = user ? portfolio.user_id === user.id : false
  const basic = getPortfolioBasic(portfolio)

  const adminUser = await checkAdmin()
  const isAdmin = adminUser !== null

  let hasPendingApplication = false
  if (user && !isHumanPortfolio(portfolio)) {
    const hasCallToJoin = !!((portfolio.metadata as any)?.properties?.call_to_join)
    if (hasCallToJoin) {
      const res = await getCurrentUserPendingActivityRequest(portfolio.id)
      if (res.success && res.hasPending) hasPendingApplication = true
    }
  }

  let hasPendingCommunityApplication = false
  if (user && !isHumanPortfolio(portfolio)) {
    const res = await getCurrentUserPendingCommunityRequest(portfolio.id)
    if (res.success && res.hasPending) hasPendingCommunityApplication = true
  }

  return (
    <PortfolioView
      portfolio={portfolio}
      basic={basic}
      isOwner={isOwner}
      currentUserId={user?.id}
      topInterests={[]}
      isAdmin={isAdmin}
      hasPendingApplication={hasPendingApplication}
      hasPendingCommunityApplication={hasPendingCommunityApplication}
    />
  )
}
