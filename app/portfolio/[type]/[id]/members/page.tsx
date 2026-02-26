import { createClient } from '@/lib/supabase/server'
import { parsePortfolioRoute, getPortfolioUrl } from '@/lib/portfolio/routes'
import { Portfolio, isProjectPortfolio, isCommunityPortfolio, isActivityPortfolio } from '@/types/portfolio'
import { notFound } from 'next/navigation'
import { isPortfolioManager, isPortfolioCreator, getPortfolioBasic } from '@/lib/portfolio/helpers'
import { MembersPageClient } from '@/components/portfolio/MembersPageClient'
import { Title, UIText } from '@/components/ui'
import { redirect } from 'next/navigation'

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

  // Normalize URL to slug
  if (portfolio.slug && id !== portfolio.slug) {
    redirect(`/portfolio/${type}/${portfolio.slug}/members?tab=${initialTab}`)
  }

  // Only projects, activities, and communities have members
  if (!isProjectPortfolio(portfolio) && !isActivityPortfolio(portfolio) && !isCommunityPortfolio(portfolio)) {
    notFound()
  }

  // Check if user is manager or creator
  const isCreator = user ? await isPortfolioCreator(portfolio.id, user.id) : false
  const isManager = user ? await isPortfolioManager(portfolio.id, user.id) : false
  const canManage = isCreator || isManager

  const basic = getPortfolioBasic(portfolio)
  const metadata = portfolio.metadata as any
  const members = metadata?.members || []
  const managers = metadata?.managers || []

  // Get member and manager details
  const memberDetails = await Promise.all(
    members.map(async (memberId: string) => {
      const { data: memberPortfolio } = await supabase
        .from('portfolios')
        .select('user_id, metadata')
        .eq('user_id', memberId)
        .eq('type', 'human')
        .maybeSingle()

      const metadata = portfolio.metadata as any
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

  // Get creator details
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

  // Get subscriber details
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

  // Load activity join requests for activities so managers can approve/reject
  let joinRequests: {
    id: string
    applicant: {
      id: string
      username: string | null
      name: string | null
      avatar: string | null
    }
    status: string
    createdAt: string
    promptAnswer: string | null
    activityRole: string | null
    respondedAt: string | null
  }[] = []

  if (canManage && isActivityPortfolio(portfolio)) {
    const { data: requestRows } = await supabase
      .from('activity_join_requests')
      .select('id, applicant_user_id, status, created_at, prompt_answer, activity_role, responded_at')
      .eq('activity_portfolio_id', portfolio.id)
      .order('created_at', { ascending: false })

    const applicantIds = Array.from(
      new Set((requestRows || []).map((r: any) => r.applicant_user_id as string))
    )

    let applicantInfoMap = new Map<
      string,
      {
        id: string
        username: string | null
        name: string | null
        avatar: string | null
      }
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
          const basic = m?.basic || {}
          applicantInfoMap.set(p.user_id as string, {
            id: p.user_id as string,
            username: m?.username || null,
            name: basic.name || m?.username || null,
            avatar: basic.avatar || m?.avatar_url || null,
          })
        })
      }
    }

    joinRequests =
      (requestRows || []).map((r: any) => {
        const applicantId: string = r.applicant_user_id
        const info =
          applicantInfoMap.get(applicantId) || {
            id: applicantId,
            username: null,
            name: null,
            avatar: null,
          }
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
      {/* Header */}
      <div className="mb-6">
        <Title as="h1" className="mb-2">Members</Title>
        <UIText as="p">{basic.name}</UIText>
      </div>

      {/* Members List */}
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
      />
    </div>
  )
}

