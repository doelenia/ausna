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
import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/utils/site-url'

interface HumanPortfolioPageProps {
  params: { idOrSlug: string }
  searchParams?: Promise<{ tab?: string; join?: string }> | { tab?: string; join?: string }
}

export async function generateMetadata({
  params,
}: HumanPortfolioPageProps): Promise<Metadata> {
  const idOrSlug = params.idOrSlug
  if (!idOrSlug || typeof idOrSlug !== 'string') return {}

  const supabase = await createClient()
  const portfolio = await loadPortfolioForPage(supabase, idOrSlug)
  if (!portfolio) return {}

  if (!isHumanPortfolio(portfolio)) {
    const canonical = getSpaceUrl(portfolio.slug || portfolio.id)
    const base = getSiteUrl()
    return { alternates: { canonical: `${base}${canonical}` } }
  }

  const canonicalPath = getHumanProfileUrl(portfolio.slug || portfolio.id)
  const base = getSiteUrl()
  const basic = getPortfolioBasic(portfolio)

  const title = basic.name || 'Human'
  const description = basic.description || ''

  return {
    title,
    description,
    alternates: { canonical: `${base}${canonicalPath}` },
    openGraph: {
      title,
      description,
      type: 'profile',
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

export default async function HumanPortfolioPage({ params, searchParams }: HumanPortfolioPageProps) {
  const idOrSlug = params.idOrSlug
  if (!idOrSlug || typeof idOrSlug !== 'string') notFound()

  const resolvedSearch =
    searchParams && typeof (searchParams as Promise<unknown>).then === 'function'
      ? await (searchParams as Promise<{ tab?: string; join?: string }>)
      : (searchParams as { tab?: string; join?: string } | undefined)
  const tabParam = resolvedSearch?.tab
  const initialTab =
    tabParam === 'spaces' || tabParam === 'feed' || tabParam === 'overview' ? tabParam : null
  const joinParam = resolvedSearch?.join
  const openJoinFromUrl = joinParam === '1' || joinParam === 'true'

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
      initialTab={initialTab}
      openJoinFromUrl={openJoinFromUrl}
    />
  )
}
