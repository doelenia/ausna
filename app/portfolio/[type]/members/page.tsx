import { createClient } from '@/lib/supabase/server'
import { Portfolio, isActivityPortfolio, isCommunityPortfolio, isProjectPortfolio } from '@/types/portfolio'
import { notFound, redirect } from 'next/navigation'
import { isPortfolioManager, isPortfolioCreator, getPortfolioBasic } from '@/lib/portfolio/helpers'
import { MembersPageClient } from '@/components/portfolio/MembersPageClient'
import { Title, UIText } from '@/components/ui'

interface MembersPageProps {
  params: {
    type: string
  }
  searchParams?: Promise<{ tab?: string }> | { tab?: string }
}

export default async function MembersPage({ params, searchParams }: MembersPageProps) {
  const resolvedSearchParams =
    searchParams && typeof (searchParams as any).then === 'function'
      ? await (searchParams as Promise<{ tab?: string }>)
      : (searchParams as { tab?: string } | undefined)

  const initialTab =
    resolvedSearchParams?.tab === 'requests'
      ? 'requests'
      : resolvedSearchParams?.tab === 'subscribers'
        ? 'subscribers'
        : 'members'

  const idOrSlug = params.type
  if (!idOrSlug) notFound()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let portfolio: Portfolio | null = null

  const { data: byId } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', idOrSlug)
    .maybeSingle()
  if (byId) portfolio = byId as Portfolio

  if (!portfolio) {
    const { data: bySlug } = await supabase
      .from('portfolios')
      .select('*')
      .eq('slug', idOrSlug)
      .maybeSingle()
    if (bySlug) portfolio = bySlug as Portfolio
  }

  if (!portfolio) {
    notFound()
  }

  if (portfolio.slug && portfolio.slug !== idOrSlug) {
    redirect(`/portfolio/${portfolio.slug}/members?tab=${initialTab}`)
  }

  if (!isProjectPortfolio(portfolio) && !isActivityPortfolio(portfolio) && !isCommunityPortfolio(portfolio)) {
    notFound()
  }

  const isCreator = user ? await isPortfolioCreator(portfolio.id, user.id) : false
  const isManager = user ? await isPortfolioManager(portfolio.id, user.id) : false
  const canManage = isCreator || isManager

  const basic = getPortfolioBasic(portfolio)
  const metadata = portfolio.metadata as any
  const members = metadata?.members || []
  const managers = metadata?.managers || []

  const memberDetails = await Promise.all(
    members.map(async (memberId: string) => {
      const { data: memberPortfolio } = await supabase
        .from('portfolios')
        .select('user_id, metadata')
        .eq('user_id', memberId)
        .eq('type', 'human')
        .maybeSingle()

      const memberRoles = metadata?.memberRoles || {}
      const role = memberRoles[memberId] || null

      if (memberPortfolio) {
        const memberMetadata = memberPortfolio.metadata as any
        const memberBasic = memberMetadata?.basic || {}
        return {
          id: memberId,
          username: memberMetadata?.username || null,
          name: memberBasic.name || memberMetadata?.username || null,
          avatar: memberBasic.avatar || memberMetadata?.avatar_url || null,
          isManager: managers.includes(memberId),
          isCreator: portfolio.user_id === memberId,
          role: role,
        }
      }
      return {
        id: memberId,
        username: null,
        name: null,
        avatar: null,
        isManager: managers.includes(memberId),
        isCreator: portfolio.user_id === memberId,
        role: role,
      }
    })
  )

  const { data: creatorPortfolio } = await supabase
    .from('portfolios')
    .select('user_id, metadata')
    .eq('user_id', portfolio.user_id)
    .eq('type', 'human')
    .maybeSingle()

  let creatorInfo = null
  if (creatorPortfolio) {
    const creatorMetadata = creatorPortfolio.metadata as any
    const creatorBasic = creatorMetadata?.basic || {}
    creatorInfo = {
      id: portfolio.user_id,
      username: creatorMetadata?.username || null,
      name: creatorBasic.name || creatorMetadata?.username || null,
      avatar: creatorBasic.avatar || creatorMetadata?.avatar_url || null,
    }
  }

  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('portfolio_id', portfolio.id)

  const subscriberIds = (subscriptions || []).map((sub: any) => sub.user_id)

  const subscriberDetails = await Promise.all(
    subscriberIds.map(async (subscriberId: string) => {
      const { data: subscriberPortfolio } = await supabase
        .from('portfolios')
        .select('user_id, metadata')
        .eq('user_id', subscriberId)
        .eq('type', 'human')
        .maybeSingle()

      if (subscriberPortfolio) {
        const subscriberMetadata = subscriberPortfolio.metadata as any
        const subscriberBasic = subscriberMetadata?.basic || {}
        return {
          id: subscriberId,
          username: subscriberMetadata?.username || null,
          name: subscriberBasic.name || subscriberMetadata?.username || null,
          avatar: subscriberBasic.avatar || subscriberMetadata?.avatar_url || null,
        }
      }
      return {
        id: subscriberId,
        username: null,
        name: null,
        avatar: null,
      }
    })
  )

  let joinRequests: {
    id: string
    applicant: { id: string; username: string | null; name: string | null; avatar: string | null }
    status: string
    createdAt: string
    promptAnswer: string | null
    activityRole: string | null
    respondedAt: string | null
  }[] = []

  if (canManage) {
    const { data: requestRows } = await supabase
      .from('portfolio_join_requests')
      .select('id, applicant_user_id, status, created_at, prompt_answer, activity_role, responded_at')
      .eq('portfolio_id', portfolio.id)
      .order('created_at', { ascending: false })

    const applicantIds = Array.from(new Set((requestRows || []).map((r: any) => r.applicant_user_id as string)))
    const applicantInfoMap = new Map<
      string,
      { id: string; username: string | null; name: string | null; avatar: string | null }
    >()

    if (applicantIds.length > 0) {
      const { data: applicantPortfolios } = await supabase
        .from('portfolios')
        .select('user_id, metadata')
        .eq('type', 'human')
        .in('user_id', applicantIds)

      if (applicantPortfolios) {
        applicantPortfolios.forEach((p: any) => {
          const m = p.metadata as any
          const b = m?.basic || {}
          applicantInfoMap.set(p.user_id as string, {
            id: p.user_id as string,
            username: m?.username || null,
            name: b.name || m?.username || null,
            avatar: b.avatar || m?.avatar_url || null,
          })
        })
      }
    }

    joinRequests =
      (requestRows || []).map((r: any) => {
        const applicantId: string = r.applicant_user_id
        const info =
          applicantInfoMap.get(applicantId) || { id: applicantId, username: null, name: null, avatar: null }
        return {
          id: r.id as string,
          applicant: info,
          status: (r.status as string) || 'pending',
          createdAt: r.created_at as string,
          promptAnswer: (r.prompt_answer as string | null) ?? null,
          activityRole: (r.activity_role as string | null) ?? null,
          respondedAt: (r.responded_at as string | null) ?? null,
        }
      }) || []
  }

  return (
    <div>
      <div className="mb-6">
        <Title as="h1" className="mb-2">
          Members
        </Title>
        <UIText as="p">{basic.name}</UIText>
      </div>

      <MembersPageClient
        portfolioId={portfolio.id}
        portfolioName={basic.name}
        portfolioType={portfolio.type}
        creatorInfo={creatorInfo}
        memberDetails={memberDetails}
        subscriberDetails={subscriberDetails}
        canManage={canManage}
        currentUserId={user?.id}
        joinRequests={joinRequests}
        initialTab={initialTab}
        isExternalActivity={(portfolio.metadata as any)?.properties?.external === true}
      />
    </div>
  )
}

