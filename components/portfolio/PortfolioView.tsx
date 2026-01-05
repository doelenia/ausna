'use client'

import { Portfolio, isProjectPortfolio, isCommunityPortfolio, isHumanPortfolio } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import Link from 'next/link'
import { PortfolioEditor } from './PortfolioEditor'
import { NotesFeed } from './NotesFeed'
import { PortfolioActions } from './PortfolioActions'
import { StickerAvatar } from './StickerAvatar'
import { Topic } from '@/types/indexing'
import { useState, useEffect } from 'react'
import { deletePortfolio, getSubPortfolios } from '@/app/portfolio/[type]/[id]/actions'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button, Title, Content, UIText, UserAvatar } from '@/components/ui'
import { Apple, ChevronRight } from 'lucide-react'

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
  const router = useRouter()
  const supabase = createClient()
  
  // Determine if user can create notes (for projects, user must be owner or member)
  const canCreateNote = isProjectPortfolio(portfolio) && (isOwner || isMember)

  // Double-check ownership and authentication on client side
  // This ensures ownership is detected even if server-side check had issues
  // CRITICAL: Don't show buttons until auth is verified
  useEffect(() => {
    const checkOwnership = async () => {
      try {
        // getUser() automatically refreshes expired tokens
        // This is critical for long-term sessions
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()
        
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
        console.error('Error checking authentication:', err)
        setIsAuthenticated(false)
        setIsOwner(false)
        setIsManager(false)
        setIsMember(false)
      } finally {
        setAuthChecked(true)
      }
    }

    checkOwnership()
    
    // Listen for auth state changes to update UI in real-time
    // This ensures buttons hide/show immediately when auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
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
      subscription.unsubscribe()
    }
  }, [portfolio.user_id, supabase, serverIsOwner])

  // Fetch projects for human portfolios (for all visitors)
  useEffect(() => {
    const fetchProjects = async () => {
      if (!isHumanPortfolio(portfolio)) {
        return
      }

      // Wait for auth check to complete before fetching
      if (!authChecked) {
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
              emoji: projectMap.get(p.id),
              role: p.role,
              projectType: p.projectType,
            }))
            setProjects(projectData)
          } else {
            setProjects([])
          }
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error)
      } finally {
        setProjectsLoading(false)
      }
    }

    fetchProjects()
  }, [portfolio.id, portfolio.type, authChecked, supabase])

  // Fetch member avatars for projects
  useEffect(() => {
    const fetchMemberAvatars = async () => {
      if (!isProjectPortfolio(portfolio)) {
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
        onSave={() => {
          setIsEditing(false)
          router.refresh()
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
          <div className="mb-6">
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

            {/* Name and Project Type */}
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <Title as="h1">{basic.name}</Title>
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

            {/* Friends Section (for human portfolios only) - Under description, no title */}
            {isHumanPortfolio(portfolio) && (() => {
              if (friendsLoading) {
                return (
                  <div className="mb-4">
                    <UIText className="text-gray-500">Loading friends...</UIText>
                  </div>
                )
              }

              if (friends.length === 0) {
                return null
              }

              const isVisitor = currentUserId && currentUserId !== portfolio.user_id

              return (
                <div className="mb-4 flex items-center gap-2">
                  {/* Show friends count */}
                  {totalMutualFriends > 0 && (
                    <UIText className="text-gray-600">
                      {isVisitor 
                        ? `${totalMutualFriends} mutual ${totalMutualFriends === 1 ? 'friend' : 'friends'}`
                        : `${totalMutualFriends} ${totalMutualFriends === 1 ? 'friend' : 'friends'}`
                      }
                    </UIText>
                  )}
                  {friends.map((friend) => (
                    <UserAvatar
                      key={friend.id}
                      userId={friend.id}
                      name={friend.name}
                      avatar={friend.avatar}
                      size={32}
                      href={`/portfolio/human/${friend.id}`}
                    />
                  ))}
                  {/* More button */}
                  <Link
                    href={`/portfolio/human/${portfolio.user_id}/friends`}
                    className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
                    title={isVisitor ? "View all mutual friends" : "View all friends"}
                  >
                    <ChevronRight className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
                  </Link>
                </div>
              )
            })()}

            {/* Members Section - Projects only */}
            {isProjectPortfolio(portfolio) && (() => {
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
              
              return (
                <div className="mb-4 flex items-center gap-2">
                  {memberAvatarsLoading ? (
                    <UIText className="text-gray-500">Loading members...</UIText>
                  ) : (
                    <>
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
                          <>
                            {displayMembers.map((member) => (
                              <UserAvatar
                                key={member.id}
                                userId={member.id}
                                name={member.name}
                                avatar={member.avatar}
                                size={32}
                                href={`/portfolio/human/${member.id}`}
                              />
                            ))}
                            {/* More button */}
                            <Link
                              href={`${getPortfolioUrl(portfolio.type, portfolio.id)}/members`}
                              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
                              title="View all members"
                            >
                              <ChevronRight className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
                            </Link>
                          </>
                        )
                      })()}
                    </>
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
            <div className="mt-4 mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Apple className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
                <UIText>Involvement</UIText>
              </div>
              <div className="flex items-start gap-8 overflow-x-auto pt-2 pb-2">
                {projectsLoading ? (
                  <UIText className="text-gray-500">Loading projects...</UIText>
                ) : (
                  <>
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="flex flex-col items-center gap-4 flex-shrink-0 px-4"
                      >
                        <StickerAvatar
                          src={project.avatar}
                          alt={project.name}
                          type="projects"
                          size={96}
                          href={getPortfolioUrl('projects', project.id)}
                          emoji={project.emoji}
                          name={project.name}
                        />
                        <div className="flex flex-col items-center gap-1">
                          <Content
                            className="text-center max-w-[140px] line-clamp-2"
                            title={project.name}
                          >
                            {project.name}
                          </Content>
                          {(project.projectType || project.role) && (
                            <UIText className="text-center max-w-[140px] truncate text-gray-600">
                              {project.projectType && project.role
                                ? `${project.projectType} · ${project.role}`
                                : project.projectType || project.role}
                            </UIText>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* Create Project Button - Only visible to owner */}
                    {authChecked && isOwner && isAuthenticated && (
                      <div className="flex flex-col items-center gap-4 flex-shrink-0">
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
                        <UIText className="text-center max-w-[96px] truncate">Create Project</UIText>
                      </div>
                    )}
                    {/* Create Community button - Admin only, owner only */}
                    {authChecked && isOwner && isAuthenticated && isAdmin === true && (
                      <div className="flex flex-col items-center gap-4 flex-shrink-0">
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
                        <UIText className="text-center max-w-[96px] truncate">Create Community</UIText>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}



          {/* Notes Feed (combines pinned notes with regular notes) */}
          <NotesFeed
            portfolio={portfolio}
            portfolioId={portfolio.id}
            currentUserId={currentUserId}
            canCreateNote={canCreateNote}
          />
        </div>
    </>
  )
}
