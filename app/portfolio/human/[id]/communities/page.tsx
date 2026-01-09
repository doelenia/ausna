import { createClient } from '@/lib/supabase/server'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { Portfolio, isHumanPortfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import Link from 'next/link'
import { Title, UIText } from '@/components/ui'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { notFound } from 'next/navigation'

interface CommunitiesPageProps {
  params: {
    id: string
  }
}

export default async function CommunitiesPage({ params }: CommunitiesPageProps) {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch portfolio - for human portfolios, id can be portfolio id, user_id, or slug
  let portfolio: Portfolio | null = null

  const { data: portfolioById } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', params.id)
    .eq('type', 'human')
    .maybeSingle()

  if (portfolioById) {
    portfolio = portfolioById as Portfolio
  } else {
    // Try fetching by user_id
    const { data: portfolioByUserId } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', params.id)
      .eq('type', 'human')
      .maybeSingle()

    if (portfolioByUserId) {
      portfolio = portfolioByUserId as Portfolio
    }
  }

  if (!portfolio) {
    // Try fetching by slug
    const { data: portfolioBySlug } = await supabase
      .from('portfolios')
      .select('*')
      .eq('slug', params.id)
      .eq('type', 'human')
      .maybeSingle()

    if (portfolioBySlug) {
      portfolio = portfolioBySlug as Portfolio
    }
  }

  if (!portfolio || !isHumanPortfolio(portfolio)) {
    notFound()
  }

  const basic = getPortfolioBasic(portfolio)

  const isVisitor = user && user.id !== portfolio.user_id

  // Load communities
  let communities: {
    id: string
    name: string
    avatar?: string
    emoji?: string
  }[] = []

  // Fetch recent communities
  const { data: allCommunities } = await supabase
    .from('portfolios')
    .select('id, metadata')
    .eq('type', 'community')
    .order('created_at', { ascending: false })
    .limit(500)

  if (allCommunities && allCommunities.length > 0) {
    const ownerId = portfolio.user_id
    const viewerId = isVisitor && user ? user.id : ownerId

    const joinedCommunities = (allCommunities as any[]).filter((p: any) => {
      const metadata = p.metadata as any
      const managers: string[] = metadata?.managers || []
      const members: string[] = metadata?.members || []
      const allMemberIds = new Set<string>([
        ...managers,
        ...members,
      ])

      // Ensure owner is a member/manager
      if (!allMemberIds.has(ownerId)) {
        return false
      }

      // For visitors, community must also include the viewer
      if (isVisitor && user) {
        return allMemberIds.has(viewerId)
      }

      // For owner view, any community they are in is included
      return true
    })

    communities = joinedCommunities.map((p: any) => {
      const metadata = p.metadata as any
      const communityBasic = metadata?.basic || {}
      return {
        id: p.id as string,
        name: communityBasic.name as string,
        avatar: communityBasic.avatar as string | undefined,
        emoji: communityBasic.emoji as string | undefined,
      }
    })
  }

  const count = communities.length
  const isSingular = count === 1

  const headerText = isVisitor
    ? count > 0
      ? `Joined ${count} mutual ${isSingular ? 'community' : 'communities'}`
      : 'No mutual communities yet'
    : count > 0
      ? `Joined ${count} ${isSingular ? 'community' : 'communities'}`
      : 'No communities joined yet'

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Title as="h1" className="mb-2">Communities</Title>
        <UIText as="p">{basic.name}</UIText>
      </div>

      {/* Communities List */}
      <div>
        <div className="mb-3">
          <UIText as="h2">
            {headerText}
          </UIText>
        </div>
        {communities.length === 0 ? (
          <div>
            <UIText>
              {isVisitor ? 'You do not share any communities yet.' : 'You have not joined any communities yet.'}
            </UIText>
          </div>
        ) : (
          <div className="space-y-2">
            {communities.map((community) => (
              <div
                key={community.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
              >
                <Link
                  href={getPortfolioUrl('community', community.id)}
                  className="flex items-center gap-3 hover:opacity-80"
                >
                  <StickerAvatar
                    src={community.avatar}
                    alt={community.name}
                    type="community"
                    size={48}
                    emoji={community.emoji}
                    name={community.name}
                    normalizeScale={1.0}
                    variant="mini"
                  />
                  <div>
                    <UIText as="div">
                      {community.name}
                    </UIText>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


