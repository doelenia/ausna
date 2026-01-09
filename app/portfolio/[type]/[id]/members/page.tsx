import { createClient } from '@/lib/supabase/server'
import { parsePortfolioRoute, getPortfolioUrl } from '@/lib/portfolio/routes'
import { Portfolio, isProjectPortfolio, isCommunityPortfolio } from '@/types/portfolio'
import { notFound } from 'next/navigation'
import { isPortfolioManager, isPortfolioCreator, getPortfolioBasic } from '@/lib/portfolio/helpers'
import { MembersPageClient } from '@/components/portfolio/MembersPageClient'
import { Title, UIText } from '@/components/ui'

interface MembersPageProps {
  params: {
    type: string
    id: string
  }
}

export default async function MembersPage({ params }: MembersPageProps) {
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

  // Only projects and communities have members
  if (!isProjectPortfolio(portfolio) && !isCommunityPortfolio(portfolio)) {
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
          name: memberBasic.name || memberMetadata?.full_name || null,
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
      name: creatorBasic.name || creatorMetadata?.full_name || null,
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
          name: subscriberBasic.name || subscriberMetadata?.full_name || null,
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
      />
    </div>
  )
}

