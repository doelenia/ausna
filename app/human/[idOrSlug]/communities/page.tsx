import { createClient } from '@/lib/supabase/server'
import { getSpaceUrl } from '@/lib/portfolio/routes'
import { isHumanPortfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import Link from 'next/link'
import { Title, UIText } from '@/components/ui'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { notFound, permanentRedirect } from 'next/navigation'
import { getHumanCommunitiesUrl } from '@/lib/portfolio/routes'
import { DB_NON_HUMAN_TYPES } from '@/types/portfolio'

interface CommunitiesPageProps {
  params: { idOrSlug: string }
}

export default async function CommunitiesPage({ params }: CommunitiesPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const portfolio = await loadPortfolioForPage(supabase, params.idOrSlug)
  if (!portfolio || !isHumanPortfolio(portfolio)) {
    notFound()
  }

  if (portfolio.slug && params.idOrSlug !== portfolio.slug) {
    permanentRedirect(getHumanCommunitiesUrl(portfolio.slug))
  }

  const basic = getPortfolioBasic(portfolio)
  const isVisitor = user && user.id !== portfolio.user_id

  let communities: { id: string; name: string; avatar?: string; emoji?: string }[] = []

  const { data: allCommunities } = await supabase
    .from('portfolios')
    .select('id, metadata, type')
    .in('type', [...DB_NON_HUMAN_TYPES])
    .order('created_at', { ascending: false })
    .limit(500)

  if (allCommunities && allCommunities.length > 0) {
    const ownerId = portfolio.user_id
    const viewerId = isVisitor && user ? user.id : ownerId

    const joinedCommunities = (allCommunities as any[]).filter((p: any) => {
      const metadata = p.metadata as any
      const managers: string[] = metadata?.managers || []
      const members: string[] = metadata?.members || []
      const allMemberIds = new Set<string>([...managers, ...members])

      if (!allMemberIds.has(ownerId)) {
        return false
      }

      if (isVisitor && user) {
        return allMemberIds.has(viewerId)
      }

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
      <div className="mb-6">
        <Title as="h1" className="mb-2">
          Communities
        </Title>
        <UIText as="p">{basic.name}</UIText>
      </div>

      <div>
        <div className="mb-3">
          <UIText as="h2">{headerText}</UIText>
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
                <Link href={getSpaceUrl(community.id)} className="flex items-center gap-3 hover:opacity-80">
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
                    <UIText as="div">{community.name}</UIText>
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
