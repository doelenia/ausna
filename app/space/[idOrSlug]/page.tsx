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
import { createServiceClient } from '@/lib/supabase/service'
import { isPendingContactInviteUser } from '@/lib/auth/contact-invite-metadata'

interface SpacePortfolioPageProps {
  params: { idOrSlug: string }
  searchParams?: Promise<{ tab?: string; join?: string }> | { tab?: string; join?: string }
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

export default async function SpacePortfolioPage({ params, searchParams }: SpacePortfolioPageProps) {
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
  let pendingPortfolioInvitationType: 'follow' | 'member' | 'manager' | null = null
  let pendingPortfolioInviterDisplayName: string | null = null
  if (user && !isHumanPortfolio(portfolio)) {
    const invRes = await getCurrentUserPendingPortfolioInvitation(portfolio.id)
    if (invRes.success && invRes.hasPending && invRes.invitationType) {
      hasPendingPortfolioInvitation = true
      pendingPortfolioInvitationType = invRes.invitationType
      pendingPortfolioInviterDisplayName =
        typeof invRes.inviterDisplayName === 'string' && invRes.inviterDisplayName.trim().length > 0
          ? invRes.inviterDisplayName.trim()
          : null
    }
  }

  let pendingUserInviteToken: string | null = null
  if (user?.email && !isHumanPortfolio(portfolio)) {
    const meta = user.user_metadata as Record<string, unknown> | undefined
    if (isPendingContactInviteUser(meta)) {
      try {
        const svc = createServiceClient()
        const email = user.email.trim().toLowerCase()
        const { data: portInv } = await svc
          .from('portfolio_invitations')
          .select('inviter_id')
          .eq('portfolio_id', portfolio.id)
          .eq('invitee_id', user.id)
          .eq('status', 'pending')
          .maybeSingle()
        if (portInv?.inviter_id) {
          const { data: ui } = await svc
            .from('user_invites')
            .select('token')
            .eq('inviter_user_id', portInv.inviter_id)
            .eq('invitee_email', email)
            .eq('status', 'pending')
            .maybeSingle()
          pendingUserInviteToken = ui?.token ?? null
        }
        if (!pendingUserInviteToken) {
          const { data: uiFb } = await svc
            .from('user_invites')
            .select('token')
            .eq('invitee_email', email)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          pendingUserInviteToken = uiFb?.token ?? null
        }
      } catch {
        pendingUserInviteToken = null
      }
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
      pendingPortfolioInviterDisplayName={pendingPortfolioInviterDisplayName}
      pendingUserInviteToken={pendingUserInviteToken}
      initialTab={initialTab}
      openJoinFromUrl={openJoinFromUrl}
    />
  )
}
