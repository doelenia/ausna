import { createClient } from '@/lib/supabase/server'
import { isHumanPortfolio } from '@/types/portfolio'
import {
  getCurrentUserPendingActivityRequest,
  getCurrentUserPendingCommunityRequest,
  getCurrentUserPendingPortfolioInvitation,
} from '@/app/portfolio/[idOrSlug]/actions'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import { PortfolioView } from '@/components/portfolio/PortfolioView'
import { checkAdmin } from '@/lib/auth/requireAdmin'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getHumanProfileUrl, getSpaceUrl } from '@/lib/portfolio/routes'
import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/utils/site-url'

interface SpacePortfolioPageProps {
  params: { idOrSlug: string }
}

export async function generateMetadata({
  params,
}: SpacePortfolioPageProps): Promise<Metadata> {
  const idOrSlug = params.idOrSlug
  if (!idOrSlug || typeof idOrSlug !== 'string') return {}

  const supabase = await createClient()
  const portfolio = await loadPortfolioForPage(supabase, idOrSlug)
  if (!portfolio) return {}

  if (isHumanPortfolio(portfolio)) {
    const canonical = getHumanProfileUrl(portfolio.slug || portfolio.id)
    const base = getSiteUrl()
    return { alternates: { canonical: `${base}${canonical}` } }
  }

  const canonicalPath = getSpaceUrl(portfolio.slug || portfolio.id)
  const base = getSiteUrl()
  const basic = getPortfolioBasic(portfolio)

  const title = basic.name || 'Space'
  const description = basic.description || ''

  return {
    title,
    description,
    alternates: { canonical: `${base}${canonicalPath}` },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${base}${canonicalPath}`,
      images: [
        {
          url: `${base}${canonicalPath}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${base}${canonicalPath}/opengraph-image`],
    },
  }
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

  let hasPendingPortfolioInvitation = false
  let pendingPortfolioInvitationType: 'member' | 'manager' | null = null
  if (user && !isHumanPortfolio(portfolio)) {
    const invRes = await getCurrentUserPendingPortfolioInvitation(portfolio.id)
    if (invRes.success && invRes.hasPending && invRes.invitationType) {
      hasPendingPortfolioInvitation = true
      pendingPortfolioInvitationType = invRes.invitationType
    }
  }

  let hasPendingApplication = false
  if (user && !isHumanPortfolio(portfolio) && !hasPendingPortfolioInvitation) {
    const hasCallToJoin = !!((portfolio.metadata as any)?.properties?.call_to_join)
    if (hasCallToJoin) {
      const res = await getCurrentUserPendingActivityRequest(portfolio.id)
      if (res.success && res.hasPending) hasPendingApplication = true
    }
  }

  let hasPendingCommunityApplication = false
  if (user && !isHumanPortfolio(portfolio) && !hasPendingPortfolioInvitation) {
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
      hasPendingPortfolioInvitation={hasPendingPortfolioInvitation}
      pendingPortfolioInvitationType={pendingPortfolioInvitationType}
    />
  )
}
