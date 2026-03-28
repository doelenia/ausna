import { createClient } from '@/lib/supabase/server'
import { isHumanPortfolio } from '@/types/portfolio'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import { getHumanFriendsUrl, getHumanProfileUrl } from '@/lib/portfolio/routes'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import Link from 'next/link'
import { Title, UIText, UserAvatar } from '@/components/ui'
import { createServiceClient } from '@/lib/supabase/service'
import { ResendInviteDialogButton } from '@/components/contacts/ResendInviteDialogButton'

interface FriendsPageProps {
  params: { idOrSlug: string }
}

export default async function FriendsPage({ params }: FriendsPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const portfolio = await loadPortfolioForPage(supabase, params.idOrSlug)
  if (!portfolio || !isHumanPortfolio(portfolio)) {
    notFound()
  }

  if (portfolio.slug && params.idOrSlug !== portfolio.slug) {
    permanentRedirect(getHumanFriendsUrl(portfolio.slug))
  }

  const basic = getPortfolioBasic(portfolio)
  const isVisitor = Boolean(user && user.id !== portfolio.user_id)

  let friendIds: string[] = []

  if (isVisitor && user) {
    const { data: currentUserFriendships } = await supabase
      .from('friends')
      .select('user_id, friend_id, status')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted')

    if (!currentUserFriendships || currentUserFriendships.length === 0) {
      friendIds = []
    } else {
      const currentUserFriendIds = new Set(
        currentUserFriendships.map((f: any) => (f.user_id === user.id ? f.friend_id : f.user_id))
      )

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
        friendIds = ownerFriendIds.filter((id: string) => currentUserFriendIds.has(id))
      }
    }
  } else {
    const { data: friendships } = await supabase
      .from('friends')
      .select('user_id, friend_id, status')
      .or(`user_id.eq.${portfolio.user_id},friend_id.eq.${portfolio.user_id}`)
      .eq('status', 'accepted')

    friendIds = (friendships || []).map((f: any) =>
      f.user_id === portfolio.user_id ? f.friend_id : f.user_id
    )
  }

  const serviceClient = createServiceClient()
  const portfoliosByUserId = new Map<
    string,
    { user_id: string; slug: string | null; metadata: any; is_pseudo: boolean }
  >()

  if (friendIds.length > 0) {
    const { data: friendPortfolios, error: friendPortfoliosError } = await serviceClient
      .from('portfolios')
      .select('user_id, slug, metadata, is_pseudo')
      .eq('type', 'human')
      .in('user_id', friendIds)

    if (friendPortfoliosError) {
      console.error('Failed to load friend portfolios via service client:', friendPortfoliosError)
    } else {
      ;(friendPortfolios || []).forEach((p: any) => {
        portfoliosByUserId.set(String(p.user_id), {
          user_id: String(p.user_id),
          slug: (p.slug as string | null) || null,
          metadata: p.metadata as any,
          is_pseudo: (p.is_pseudo as boolean) === true,
        })
      })
    }
  }

  const friendDetails = friendIds.map((friendId: string) => {
    const p = portfoliosByUserId.get(friendId) || null
    const meta = p?.metadata || {}
    const basicMeta = meta?.basic || {}
    const isPseudo = p?.is_pseudo === true

    return {
      id: friendId,
      isPseudo,
      username: isPseudo ? null : (p?.slug as string | null) || meta?.username || null,
      name: (basicMeta.name as string | undefined) || (meta?.full_name as string | undefined) || null,
      avatar: (basicMeta.avatar as string | undefined) || (meta?.avatar_url as string | undefined) || null,
      email: (meta?.email as string | undefined) || null,
    }
  })

  const realFriends = friendDetails.filter((f) => !f.isPseudo)
  const pseudoFriends = friendDetails.filter((f) => f.isPseudo)

  return (
    <div>
      <div className="mb-6">
        <Title as="h1" className="mb-2">
          Friends
        </Title>
        <UIText as="p">{basic.name}</UIText>
      </div>

      <div>
        <div className="mb-3">
          <UIText as="h2">
            {isVisitor ? 'Mutual Friends' : 'Friends'}{' '}
            {realFriends.length > 0 && `(${realFriends.length})`}
          </UIText>
        </div>
        {realFriends.length === 0 ? (
          <div>
            <UIText>{isVisitor ? 'No mutual friends' : 'No friends yet'}</UIText>
          </div>
        ) : (
          <div className="space-y-2">
            {realFriends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
              >
                <Link
                  href={getHumanProfileUrl(friend.id)}
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
                    {friend.username && <UIText as="div">@{friend.username}</UIText>}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {pseudoFriends.length > 0 && (
        <div className="mt-8">
          <div className="mb-3">
            <UIText as="h2">Other contacts ({pseudoFriends.length})</UIText>
          </div>
          <div className="space-y-2">
            {pseudoFriends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
              >
                <div className="flex items-center gap-3">
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
                    {friend.username && <UIText as="div">@{friend.username}</UIText>}
                    <UIText as="div" className="text-gray-600 text-xs mt-1">
                      Contact (not yet on Ausna)
                    </UIText>
                  </div>
                </div>
                {user?.id && friend.email && (
                  <ResendInviteDialogButton
                    ownerUserId={user.id}
                    email={friend.email}
                    name={friend.name}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
