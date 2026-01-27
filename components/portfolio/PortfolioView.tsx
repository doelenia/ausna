'use client'

import { Portfolio, isProjectPortfolio, isCommunityPortfolio, isHumanPortfolio } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import Link from 'next/link'
import { PortfolioEditor } from './PortfolioEditor'
import { NotesFeed } from './NotesFeed'
import { PortfolioActions } from './PortfolioActions'
import { StickerAvatar } from './StickerAvatar'
import { CommunityMembersGrid } from './CommunityMembersGrid'
import { Topic } from '@/types/indexing'
import { useState, useEffect, useRef, useMemo } from 'react'
import { deletePortfolio, getSubPortfolios } from '@/app/portfolio/[type]/[id]/actions'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button, Title, Content, UIText, UserAvatar } from '@/components/ui'
import { Apple, ChevronRight, BadgeCheck } from 'lucide-react'

interface PortfolioViewProps {
  portfolio: Portfolio
  basic: {
    name: string
    description?: string
    avatar?: string
  }
  isOwner: boolean
  currentUserId?: string
  topInterests?: Array<{ topic: Topic; memory_score: number; aggregate_score: number }>
  isAdmin?: boolean
}

export function PortfolioView({ portfolio, basic, isOwner: serverIsOwner, currentUserId, topInterests = [], isAdmin = false }: PortfolioViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const [isMember, setIsMember] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [projects, setProjects] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string; role?: string; projectType?: string | null }>>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [memberAvatars, setMemberAvatars] = useState<Array<{ id: string; avatar?: string; name?: string }>>([])
  const [memberAvatarsLoading, setMemberAvatarsLoading] = useState(false)
  const [friends, setFriends] = useState<Array<{ id: string; avatar?: string; name?: string }>>([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [totalMutualFriends, setTotalMutualFriends] = useState<number>(0)
  const [communities, setCommunities] = useState<Array<{ id: string; name?: string; avatar?: string; emoji?: string }>>([])
  const [communitiesLoading, setCommunitiesLoading] = useState(false)
  const [totalMutualCommunities, setTotalMutualCommunities] = useState<number>(0)
  const involvementScrollRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  
  // Determine if user can create notes (for projects, user must be owner or member)
  const canCreateNote = isProjectPortfolio(portfolio) && (isOwner || isMember)

  // Double-check ownership and authentication on client side
  // This ensures ownership is detected even if server-side check had issues
  // CRITICAL: Don't show buttons until auth is verified
  useEffect(() => {
    let isMounted = true
    
    const checkOwnership = async () => {
      try {
        // Add timeout to prevent hanging (5 seconds)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Auth check timeout')), 5000)
        })
        
        // getUser() automatically refreshes expired tokens
        // This is critical for long-term sessions
        const getUserPromise = supabase.auth.getUser()
        
        const {
          data: { user },
          error,
        } = await Promise.race([getUserPromise, timeoutPromise]) as any
        
        if (!isMounted) return
        
        // If there's an error or no user, user is not authenticated
        if (error || !user) {
          setIsAuthenticated(false)
          setIsOwner(false)
          setAuthChecked(true)
          return
        }
        
        setIsAuthenticated(true)
        
        // Compare directly with portfolio.user_id
        const clientIsOwner = portfolio.user_id === user.id
        // Only trust server check if it matches client check, otherwise use client check
        setIsOwner(clientIsOwner && (serverIsOwner || clientIsOwner))
        
        // Check if user is a manager or member (for project/community portfolios)
        if (isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio)) {
          const metadata = portfolio.metadata as any
          const managers = metadata?.managers || []
          const members = metadata?.members || []
          
          setIsManager(Array.isArray(managers) && managers.includes(user.id))
          setIsMember(Array.isArray(members) && members.includes(user.id))
        } else {
          setIsManager(false)
          setIsMember(false)
        }
      } catch (err) {
        if (!isMounted) return
        console.error('Error checking authentication:', err)
        setIsAuthenticated(false)
        setIsOwner(false)
        setIsManager(false)
        setIsMember(false)
      } finally {
        if (isMounted) {
          setAuthChecked(true)
        }
      }
    }

    checkOwnership()
    
    // Listen for auth state changes to update UI in real-time
    // This ensures buttons hide/show immediately when auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      if (event === 'SIGNED_OUT' || !session) {
        setIsAuthenticated(false)
        setIsOwner(false)
        setIsManager(false)
        setIsMember(false)
        setAuthChecked(true)
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Re-check ownership when user signs in or token is refreshed
        checkOwnership()
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [portfolio.user_id, serverIsOwner]) // Removed supabase dependency - it's now memoized and stable

  // Fetch projects for human portfolios (for all visitors)
  // Note: Projects should be visible to all visitors, not just authenticated users
  // Auth check is only needed for the "Create Project" button, not for fetching projects
  useEffect(() => {
    const fetchProjects = async () => {
      if (!isHumanPortfolio(portfolio)) {
        return
      }

      setProjectsLoading(true)
      try {
        const result = await getSubPortfolios(portfolio.id)
        if (result.success && result.projects) {
          // Fetch full portfolio data for all projects in a single query to get emoji
          const projectIds = result.projects.map(p => p.id)
          if (projectIds.length > 0) {
            const { data: fullProjects } = await supabase
              .from('portfolios')
              .select('id, metadata')
              .in('id', projectIds)
            
            const projectMap = new Map(
              (fullProjects || []).map((p: any) => {
                const metadata = p.metadata as any
                return [p.id, metadata?.basic?.emoji]
              })
            )

            const projectData = result.projects.map((p) => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              emoji: projectMap.get(p.id) as string | undefined,
              role: p.role,
              projectType: p.projectType,
            }))
            setProjects(projectData)
          } else {
            setProjects([])
          }
        } else {
          // Log error if result was not successful
          if (result.error) {
            console.error('Failed to fetch projects:', result.error)
          }
          setProjects([])
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error)
        setProjects([])
      } finally {
        setProjectsLoading(false)
      }
    }

    fetchProjects()
  }, [portfolio.id, portfolio.type, supabase])

  // Fetch member avatars for projects and communities
  useEffect(() => {
    const fetchMemberAvatars = async () => {
      if (!isProjectPortfolio(portfolio) && !isCommunityPortfolio(portfolio)) {
        return
      }

      setMemberAvatarsLoading(true)
      try {
        const metadata = portfolio.metadata as any
        const allMemberIds = [
          portfolio.user_id, // Creator
          ...(metadata?.managers || []),
          ...(metadata?.members || []),
        ]
        
        // Remove duplicates
        const uniqueMemberIds = Array.from(new Set(allMemberIds))
        
        if (uniqueMemberIds.length === 0) {
          setMemberAvatars([])
          setMemberAvatarsLoading(false)
          return
        }

        // Fetch human portfolios for all members
        const { data: memberPortfolios } = await supabase
          .from('portfolios')
          .select('user_id, metadata')
          .eq('type', 'human')
          .in('user_id', uniqueMemberIds)

        const avatars = (memberPortfolios || []).map((p: any) => {
          const memberMetadata = p.metadata as any
          const memberBasic = memberMetadata?.basic || {}
          return {
            id: p.user_id,
            avatar: memberBasic.avatar || memberMetadata?.avatar_url || null,
            name: memberBasic.name || memberMetadata?.username || null,
          }
        })

        setMemberAvatars(avatars)
      } catch (error) {
        console.error('Failed to fetch member avatars:', error)
        setMemberAvatars([])
      } finally {
        setMemberAvatarsLoading(false)
      }
    }

    fetchMemberAvatars()
  }, [portfolio, supabase])

  // Fetch friends for human portfolios
  // For visitors: show mutual friends, for owner: show all friends
  useEffect(() => {
    const fetchFriends = async () => {
      if (!isHumanPortfolio(portfolio)) {
        return
      }

      // Wait for auth check to complete
      if (!authChecked) {
        return
      }

      setFriendsLoading(true)
      try {
        const isVisitor = currentUserId && currentUserId !== portfolio.user_id

        if (isVisitor) {
          // Fetch mutual friends for visitors
          // Get current user's friends
          const { data: currentUserFriendships } = await supabase
            .from('friends')
            .select('user_id, friend_id, status')
            .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
            .eq('status', 'accepted')

          if (!currentUserFriendships || currentUserFriendships.length === 0) {
            setFriends([])
            setTotalMutualFriends(0)
            setFriendsLoading(false)
            return
          }

          const currentUserFriendIds = new Set(
            currentUserFriendships.map((f: any) => 
              f.user_id === currentUserId ? f.friend_id : f.user_id
            )
          )

          // Get portfolio owner's friends
          const { data: ownerFriendships } = await supabase
            .from('friends')
            .select('user_id, friend_id, status')
            .or(`user_id.eq.${portfolio.user_id},friend_id.eq.${portfolio.user_id}`)
            .eq('status', 'accepted')

          if (!ownerFriendships || ownerFriendships.length === 0) {
            setFriends([])
            setTotalMutualFriends(0)
            setFriendsLoading(false)
            return
          }

          const ownerFriendIds = ownerFriendships.map((f: any) => 
            f.user_id === portfolio.user_id ? f.friend_id : f.user_id
          )

          // Find mutual friends
          const mutualFriendIds = ownerFriendIds.filter((id: string) => 
            currentUserFriendIds.has(id)
          )

          setTotalMutualFriends(mutualFriendIds.length)

          if (mutualFriendIds.length === 0) {
            setFriends([])
            setFriendsLoading(false)
            return
          }

          // Fetch mutual friend portfolios (limit to 5 for display)
          const displayIds = mutualFriendIds.slice(0, 5)
          const { data: friendPortfolios } = await supabase
            .from('portfolios')
            .select('user_id, metadata')
            .eq('type', 'human')
            .in('user_id', displayIds)

          const friendData = (friendPortfolios || []).map((p: any) => {
            const friendMetadata = p.metadata as any
            const friendBasic = friendMetadata?.basic || {}
            return {
              id: p.user_id,
              avatar: friendBasic.avatar || friendMetadata?.avatar_url || null,
              name: friendBasic.name || friendMetadata?.username || null,
            }
          })

          setFriends(friendData)
        } else {
          // For owner: show all friends
          // First, get total count of all friendships (no limit)
          const { data: allFriendships } = await supabase
            .from('friends')
            .select('user_id, friend_id, status')
            .or(`user_id.eq.${portfolio.user_id},friend_id.eq.${portfolio.user_id}`)
            .eq('status', 'accepted')

          if (!allFriendships || allFriendships.length === 0) {
            setFriends([])
            setTotalMutualFriends(0)
            setFriendsLoading(false)
            return
          }

          // Set total friends count
          const totalFriends = allFriendships.length
          setTotalMutualFriends(totalFriends)

          // Extract friend IDs (limit to 5 for display)
          const allFriendIds = allFriendships.map((f: any) => 
            f.user_id === portfolio.user_id ? f.friend_id : f.user_id
          )
          const displayFriendIds = allFriendIds.slice(0, 5)

          // Fetch friend portfolios for display (only first 5)
          const { data: friendPortfolios } = await supabase
            .from('portfolios')
            .select('user_id, metadata')
            .eq('type', 'human')
            .in('user_id', displayFriendIds)

          const friendData = (friendPortfolios || []).map((p: any) => {
            const friendMetadata = p.metadata as any
            const friendBasic = friendMetadata?.basic || {}
            return {
              id: p.user_id,
              avatar: friendBasic.avatar || friendMetadata?.avatar_url || null,
              name: friendBasic.name || friendMetadata?.username || null,
            }
          })

          setFriends(friendData)
        }
      } catch (error) {
        console.error('Failed to fetch friends:', error)
        setFriends([])
        setTotalMutualFriends(0)
      } finally {
        setFriendsLoading(false)
      }
    }

    fetchFriends()
  }, [portfolio, supabase, currentUserId, authChecked])

  // Fetch communities for human portfolios
  // For visitors: show mutual communities, for owner: show all joined communities
  useEffect(() => {
    const fetchCommunities = async () => {
      if (!isHumanPortfolio(portfolio)) {
        return
      }

      if (!authChecked) {
        return
      }

      setCommunitiesLoading(true)
      try {
        const isVisitor = currentUserId && currentUserId !== portfolio.user_id

        // Fetch recent communities
        const { data: allCommunities } = await supabase
          .from('portfolios')
          .select('id, metadata')
          .eq('type', 'community')
          .order('created_at', { ascending: false })
          .limit(200)

        if (!allCommunities || allCommunities.length === 0) {
          setCommunities([])
          setTotalMutualCommunities(0)
          return
        }

        const ownerId = portfolio.user_id
        const viewerId = isVisitor ? currentUserId! : ownerId

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
          if (isVisitor) {
            return allMemberIds.has(viewerId)
          }

          // For owner view, any community they are in is included
          return true
        })

        if (joinedCommunities.length === 0) {
          setCommunities([])
          setTotalMutualCommunities(0)
          return
        }

        const communityData = joinedCommunities.map((p: any) => {
          const metadata = p.metadata as any
          const basic = metadata?.basic || {}
          return {
            id: p.id as string,
            name: basic.name as string | undefined,
            avatar: basic.avatar as string | undefined,
            emoji: basic.emoji as string | undefined,
          }
        })

        setCommunities(communityData)
        setTotalMutualCommunities(communityData.length)
      } catch (error) {
        console.error('Failed to fetch communities:', error)
        setCommunities([])
        setTotalMutualCommunities(0)
      } finally {
        setCommunitiesLoading(false)
      }
    }

    fetchCommunities()
  }, [portfolio, supabase, currentUserId, authChecked])

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this portfolio? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    const result = await deletePortfolio(portfolio.id)

    if (result.success) {
      router.push('/portfolio')
      router.refresh()
    } else {
      alert(result.error || 'Failed to delete portfolio')
      setIsDeleting(false)
    }
  }

  if (isEditing) {
    return (
      <PortfolioEditor
        portfolio={portfolio}
        onCancel={() => setIsEditing(false)}
        onSave={async () => {
          setIsEditing(false)
          // Force a full page reload to ensure fresh data is loaded
          // This ensures the server action completes and cache is cleared
          const portfolioUrl = isHumanPortfolio(portfolio) 
            ? `/portfolio/human/${portfolio.user_id}`
            : getPortfolioUrl(portfolio.type, portfolio.id)
          // Use window.location to force a full page reload with fresh data
          window.location.href = portfolioUrl
        }}
      />
    )
  }

  const metadata = portfolio.metadata as any
  const members = metadata?.members || []
  const managers = metadata?.managers || []

  // Determine tab label based on portfolio type
  const tabLabel = isHumanPortfolio(portfolio) ? 'Involvement' : 'Navigations'

  return (
    <>
    <div className="bg-transparent rounded-lg p-6">
          {/* Header with avatar, name, description, and buttons */}
          <div className="mb-6 mt-12">
            {/* Avatar */}
            <div className="mb-4">
              {basic.avatar ? (
                <StickerAvatar
                  src={basic.avatar}
                  alt={basic.name}
                  type={portfolio.type}
                  size={96}
                  href={isHumanPortfolio(portfolio) ? `/portfolio/human/${portfolio.user_id}` : getPortfolioUrl(portfolio.type, portfolio.id)}
                  className="flex-shrink-0"
                />
              ) : isHumanPortfolio(portfolio) ? (
                <Link
                  href={`/portfolio/human/${portfolio.user_id}`}
                  className="flex-shrink-0 h-24 w-24 rounded-full bg-gray-200 flex items-center justify-center border-2 border-gray-300 hover:border-blue-500 transition-colors cursor-pointer"
                >
                  <svg
                    className="h-12 w-12 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </Link>
              ) : (
                <StickerAvatar
                  alt={basic.name}
                  type={portfolio.type}
                  size={96}
                  emoji={(metadata as any)?.basic?.emoji || '🎨'}
                  name={basic.name}
                  href={getPortfolioUrl(portfolio.type, portfolio.id)}
                  className="flex-shrink-0"
                />
              )}
            </div>

            {/* Name, Verified Badge, and Project Type */}
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Title as="h1">{basic.name}</Title>
                {(() => {
                  const meta = portfolio.metadata as any
                  const isPseudo: boolean | null | undefined = (portfolio as any).is_pseudo
                  const isApprovedFromMeta = meta?.is_approved === true
                  const isVerified =
                    isPseudo === false ? true :
                    isPseudo === true ? false :
                    isApprovedFromMeta

                  if (isVerified) {
                    return (
                      <BadgeCheck
                        aria-label="Verified user"
                        className="w-5 h-5 text-blue-500"
                        strokeWidth={2}
                      />
                    )
                  }
                  return null
                })()}
              </div>
              {(isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio)) && (() => {
                const metadata = portfolio.metadata as any
                const projectTypeSpecific = metadata?.project_type_specific
                if (projectTypeSpecific) {
                  return (
                    <UIText className="text-gray-600">
                      {projectTypeSpecific}
                    </UIText>
                  )
                }
                return null
              })()}
            </div>

            {/* Description */}
            {basic.description && (
              <Content className="mb-4">{basic.description}</Content>
            )}

            {/* Friends & Communities Section (human portfolios only) - Under description, no title */}
            {isHumanPortfolio(portfolio) && (
              <div className="mb-4 flex flex-wrap gap-2">
                {/* Friends pill */}
                {(() => {
                  if (friendsLoading) {
                    return (
                      <div className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 flex-shrink-0">
                        <UIText className="text-gray-500">Loading friends...</UIText>
                      </div>
                    )
                  }

                  if (friends.length === 0) {
                    return null
                  }

                  const isVisitor = currentUserId && currentUserId !== portfolio.user_id

                  const friendCountText =
                    totalMutualFriends > 0
                      ? isVisitor
                        ? `${totalMutualFriends} mutual ${totalMutualFriends === 1 ? 'friend' : 'friends'}`
                        : `${totalMutualFriends} ${totalMutualFriends === 1 ? 'friend' : 'friends'}`
                      : null

                  const displayFriends = friends.slice(0, 5)

                  return (
                    <Link
                      href={`/portfolio/human/${portfolio.user_id}/friends`}
                      className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 min-w-0"
                      title={isVisitor ? 'View all mutual friends' : 'View all friends'}
                    >
                      {/* Stacked avatars */}
                      <div className="flex -space-x-2 flex-shrink-0">
                        {displayFriends.map((friend, index) => (
                          <div
                            key={friend.id}
                            className="relative"
                            style={{ zIndex: displayFriends.length - index }}
                          >
                            <UserAvatar
                              userId={friend.id}
                              name={friend.name}
                              avatar={friend.avatar}
                              size={32}
                              showLink={false}
                            />
                          </div>
                        ))}
                      </div>
                      {/* Text after avatars */}
                      {friendCountText && (
                        <UIText className="text-gray-600 whitespace-nowrap">
                          {friendCountText}
                        </UIText>
                      )}
                    </Link>
                  )
                })()}

                {/* Communities pill */}
                {(() => {
                  if (communitiesLoading) {
                    return (
                      <div className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 flex-shrink-0">
                        <UIText className="text-gray-500">Loading communities...</UIText>
                      </div>
                    )
                  }

                  if (communities.length === 0) {
                    return null
                  }

                  const isVisitor = currentUserId && currentUserId !== portfolio.user_id

                  const communityCountText =
                    totalMutualCommunities > 0
                      ? isVisitor
                        ? `joined ${totalMutualCommunities} mutual ${totalMutualCommunities === 1 ? 'community' : 'communities'}`
                        : `joined ${totalMutualCommunities} ${totalMutualCommunities === 1 ? 'community' : 'communities'}`
                      : null

                  const displayCommunities = communities.slice(0, 5)

                  return (
                    <Link
                      href={`/portfolio/human/${portfolio.user_id}/communities`}
                      className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0 min-w-0"
                      title={isVisitor ? 'View all mutual communities' : 'View all communities'}
                    >
                      {/* Community avatars (non-stacked) */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {displayCommunities.map((community) => (
                          <StickerAvatar
                            key={community.id}
                            src={community.avatar}
                            alt={community.name || 'Community'}
                            type="community"
                            size={34}
                            emoji={community.emoji}
                            name={community.name}
                            normalizeScale={1.0}
                            variant="mini"
                          />
                        ))}
                      </div>
                      {/* Text after avatars */}
                      {communityCountText && (
                        <UIText className="text-gray-600 whitespace-nowrap">
                          {communityCountText}
                        </UIText>
                      )}
                    </Link>
                  )
                })()}
              </div>
            )}

            {/* Members Section - Projects and Communities */}
            {(isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio)) && (() => {
              // Combine all members: creator, managers, members
              const allMemberIds: string[] = []
              
              // Add creator
              allMemberIds.push(portfolio.user_id)
              
              // Add managers (excluding creator)
              managers.forEach((managerId: string) => {
                if (managerId !== portfolio.user_id) {
                  allMemberIds.push(managerId)
                }
              })
              
              // Add members (excluding creator and managers)
              members.forEach((memberId: string) => {
                if (memberId !== portfolio.user_id && !managers.includes(memberId)) {
                  allMemberIds.push(memberId)
                }
              })
              
              // Only show section if there are members
              if (allMemberIds.length === 0) {
                return null
              }
              
              const totalMembers = allMemberIds.length
              
              return (
                <div className="mb-4">
                  {memberAvatarsLoading ? (
                    <UIText className="text-gray-500">Loading members...</UIText>
                  ) : (
                    <Link
                      href={`${getPortfolioUrl(portfolio.type, portfolio.id)}/members`}
                      className="inline-flex items-center gap-2 px-2 py-1 rounded-full hover:bg-gray-100 transition-colors"
                      title="View all members"
                    >
                      {(() => {
                        // Create member info array with avatars
                        const memberInfo = allMemberIds.map((memberId: string) => {
                          const avatarInfo = memberAvatars.find(m => m.id === memberId)
                          return {
                            id: memberId,
                            avatar: avatarInfo?.avatar || null,
                            name: avatarInfo?.name || null,
                          }
                        })
                        
                        // Sort: current user first if they're a member
                        const sortedMembers = [...memberInfo].sort((a, b) => {
                          if (currentUserId && a.id === currentUserId) return -1
                          if (currentUserId && b.id === currentUserId) return 1
                          return 0
                        })
                        
                        // Limit to 5
                        const displayMembers = sortedMembers.slice(0, 5)
                        
                        return (
                          <div className="flex items-center gap-2">
                            {/* Stacked member avatars */}
                            <div className="flex -space-x-2">
                              {displayMembers.map((member, index) => (
                                <div
                                  key={member.id}
                                  className="relative"
                                  style={{ zIndex: displayMembers.length - index }}
                                >
                                  <UserAvatar
                                    userId={member.id}
                                    name={member.name}
                                    avatar={member.avatar}
                                    size={32}
                                    showLink={false}
                                  />
                                </div>
                              ))}
                            </div>
                            {/* Member count text */}
                            <UIText className="text-gray-600">
                              {totalMembers}{' '}
                              {totalMembers === 1 ? 'member' : 'members'}
                            </UIText>
                          </div>
                        )
                      })()}
                    </Link>
                  )}
                </div>
              )
            })()}

            {/* Buttons */}
            <div className="mb-12">
              <PortfolioActions
                portfolio={portfolio}
                isOwner={isOwner}
                isManager={isManager}
                isMember={isMember}
                isAuthenticated={isAuthenticated}
                authChecked={authChecked}
                currentUserId={currentUserId}
                onEdit={() => setIsEditing(true)}
                onDelete={handleDelete}
                isDeleting={isDeleting}
              />
            </div>
          </div>

          {/* Projects Row (for all visitors, human portfolios only) */}
          {isHumanPortfolio(portfolio) && (
            <div className="mt-4 mb-8 group">
              <div className="flex items-center gap-2 mb-4">
                <Apple className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
                <UIText>Involvement</UIText>
              </div>
              <div className="relative">
                {/* Horizontal scroll buttons for mouse users */}
                <button
                  type="button"
                  className="hidden group-hover:flex items-center justify-center absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full p-0 bg-gray-200 hover:bg-gray-300 border border-gray-300 shadow-sm z-10 transition-colors"
                  onClick={() => {
                    if (involvementScrollRef.current) {
                      involvementScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' })
                    }
                  }}
                >
                  <ChevronRight className="w-5 h-5 rotate-180 text-gray-700" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className="hidden group-hover:flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-8 h-8 rounded-full p-0 bg-gray-200 hover:bg-gray-300 border border-gray-300 shadow-sm z-10 transition-colors"
                  onClick={() => {
                    if (involvementScrollRef.current) {
                      involvementScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' })
                    }
                  }}
                >
                  <ChevronRight className="w-5 h-5 text-gray-700" strokeWidth={1.5} />
                </button>
                <div
                  ref={involvementScrollRef}
                  className="flex items-start gap-4 overflow-x-auto pt-2 pb-2 scroll-smooth"
                >
                {projectsLoading ? (
                  <UIText className="text-gray-500">Loading projects...</UIText>
                ) : (
                  <>
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="flex flex-col items-center flex-shrink-0 w-48"
                      >
                        <Link
                          href={getPortfolioUrl('projects', project.id)}
                          className="w-full rounded-2xl px-3 pt-3 pb-4 transition-colors hover:bg-gray-100 block"
                        >
                          <div className="flex flex-col items-center gap-3">
                            <StickerAvatar
                              src={project.avatar}
                              alt={project.name}
                              type="projects"
                              size={96}
                              emoji={project.emoji}
                              name={project.name}
                            />
                            <div className="flex flex-col items-center gap-1 w-full">
                              <Content
                                className="text-center max-w-[140px] mx-auto line-clamp-2"
                                title={project.name}
                              >
                                {project.name}
                              </Content>
                              {(project.projectType || project.role) && (
                                <UIText className="text-center max-w-[140px] mx-auto truncate text-gray-600">
                                  {project.projectType && project.role
                                    ? `${project.projectType} · ${project.role}`
                                    : project.projectType || project.role}
                                </UIText>
                              )}
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                    {/* Create Project Button - Only visible to owner */}
                    {authChecked && isOwner && isAuthenticated && (
                      <div className="flex flex-col items-center flex-shrink-0 w-48">
                        <div className="w-full rounded-2xl px-3 pt-3 pb-4">
                          <div className="flex flex-col items-center gap-3">
                            <Link
                              href="/portfolio/create/projects"
                              className="w-24 h-24 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors flex items-center justify-center border-2 border-gray-300 hover:border-gray-400 cursor-pointer"
                            >
                              <svg
                                className="h-12 w-12 text-gray-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                            </Link>
                            <UIText className="text-center max-w-[140px] mx-auto truncate">
                              Create Project
                            </UIText>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Create Community button - Admin only, owner only */}
                    {authChecked && isOwner && isAuthenticated && isAdmin === true && (
                      <div className="flex flex-col items-center flex-shrink-0 w-48">
                        <div className="w-full rounded-2xl px-3 pt-3 pb-4">
                          <div className="flex flex-col items-center gap-3">
                            <Link
                              href="/portfolio/create/community"
                              className="w-24 h-24 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors flex items-center justify-center border-2 border-gray-300 hover:border-gray-400 cursor-pointer"
                            >
                              <svg
                                className="h-12 w-12 text-gray-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                />
                              </svg>
                            </Link>
                            <UIText className="text-center max-w-[140px] mx-auto truncate">
                              Create Community
                            </UIText>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                </div>
              </div>
            </div>
          )}



          {/* Community Members Grid (for communities) or Notes Feed (for projects/humans) */}
          {isCommunityPortfolio(portfolio) ? (
            <CommunityMembersGrid
              portfolioId={portfolio.id}
              creatorId={portfolio.user_id}
              managers={managers}
              members={members}
              memberRoles={metadata?.memberRoles || {}}
              currentUserId={currentUserId}
            />
          ) : (
            <NotesFeed
              portfolio={portfolio}
              portfolioId={portfolio.id}
              currentUserId={currentUserId}
              canCreateNote={canCreateNote}
            />
          )}
        </div>
    </>
  )
}
