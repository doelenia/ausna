import { createClient } from '@/lib/supabase/server'
import { parsePortfolioRoute, getPortfolioUrl } from '@/lib/portfolio/routes'
import { Portfolio, isHumanPortfolio } from '@/types/portfolio'
import { notFound } from 'next/navigation'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import Link from 'next/link'
import { Title, UIText, UserAvatar } from '@/components/ui'

interface FriendsPageProps {
  params: {
    id: string
  }
}

export default async function FriendsPage({ params }: FriendsPageProps) {
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

  // Determine if current user is a visitor (not the owner)
  const isVisitor = user && user.id !== portfolio.user_id

  let friendIds: string[] = []

  if (isVisitor) {
    // For visitors: show only mutual friends
    // Get current user's friends
    const { data: currentUserFriendships } = await supabase
      .from('friends')
      .select('user_id, friend_id, status')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted')

    if (!currentUserFriendships || currentUserFriendships.length === 0) {
      friendIds = []
    } else {
      const currentUserFriendIds = new Set(
        currentUserFriendships.map((f: any) => 
          f.user_id === user.id ? f.friend_id : f.user_id
        )
      )

      // Get portfolio owner's friends
      const { data: ownerFriendships } = await supabase
        .from('friends')
        .select('user_id, friend_id, status')
        .or(`user_id.eq.${portfolio.user_id},friend_id.eq.${portfolio.user_id}`)
        .eq('status', 'accepted')

      if (!ownerFriendships || ownerFriendships.length === 0) {
        friendIds = []
      } else {
        const ownerFriendIds = ownerFriendships.map((f: any) => 
          f.user_id === portfolio.user_id ? f.friend_id : f.user_id
        )

        // Find mutual friends
        friendIds = ownerFriendIds.filter((id: string) => 
          currentUserFriendIds.has(id)
        )
      }
    }
  } else {
    // For owner: show all friends
    const { data: friendships } = await supabase
      .from('friends')
      .select('user_id, friend_id, status')
      .or(`user_id.eq.${portfolio.user_id},friend_id.eq.${portfolio.user_id}`)
      .eq('status', 'accepted')

    // Extract friend IDs
    friendIds = (friendships || []).map((f: any) => 
      f.user_id === portfolio.user_id ? f.friend_id : f.user_id
    )
  }

  // Get friend details
  const friendDetails = await Promise.all(
    friendIds.map(async (friendId: string) => {
      const { data: friendPortfolio } = await supabase
        .from('portfolios')
        .select('user_id, metadata')
        .eq('user_id', friendId)
        .eq('type', 'human')
        .maybeSingle()

      if (friendPortfolio) {
        const friendMetadata = friendPortfolio.metadata as any
        const friendBasic = friendMetadata?.basic || {}
        return {
          id: friendId,
          username: friendMetadata?.username || null,
          name: friendBasic.name || friendMetadata?.full_name || null,
          avatar: friendBasic.avatar || friendMetadata?.avatar_url || null,
        }
      }
      return {
        id: friendId,
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
        <Link
          href={getPortfolioUrl(portfolio.type, portfolio.id)}
          className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
        >
          <UIText>← Back to Portfolio</UIText>
        </Link>
        <Title as="h1" className="mb-2">Friends</Title>
        <UIText as="p">{basic.name}</UIText>
      </div>

      {/* Friends List */}
      <div>
        <div className="mb-3">
          <UIText as="h2">
            {isVisitor ? 'Mutual Friends' : 'Friends'} {friendDetails.length > 0 && `(${friendDetails.length})`}
          </UIText>
        </div>
        {friendDetails.length === 0 ? (
          <div><UIText>{isVisitor ? 'No mutual friends' : 'No friends yet'}</UIText></div>
        ) : (
          <div className="space-y-2">
            {friendDetails.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
              >
                <Link
                  href={`/portfolio/human/${friend.id}`}
                  className="flex items-center gap-3 hover:opacity-80"
                >
                  <UserAvatar
                    userId={friend.id}
                    name={friend.name}
                    avatar={friend.avatar}
                    size={40}
                    showLink={false}
                  />
                  <div>
                    <UIText as="div">
                      {friend.name || friend.username || `User ${friend.id.slice(0, 8)}`}
                      {friend.id === user?.id && ' (You)'}
                    </UIText>
                    {friend.username && (
                      <UIText as="div">@{friend.username}</UIText>
                    )}
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

