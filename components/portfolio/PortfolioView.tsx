'use client'

import { Portfolio, isProjectPortfolio, isCommunityPortfolio, isHumanPortfolio } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import Link from 'next/link'
import { PortfolioEditor } from './PortfolioEditor'
import { NotesFeed } from './NotesFeed'
import { SubscribeButton } from './SubscribeButton'
import { FriendButton } from './FriendButton'
import { StickerAvatar } from './StickerAvatar'
import { Topic } from '@/types/indexing'
import { useState, useEffect } from 'react'
import { deletePortfolio, getSubPortfolios } from '@/app/portfolio/[type]/[id]/actions'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button, Title, Content, UIText } from '@/components/ui'
import { Apple } from 'lucide-react'

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
  const [projects, setProjects] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string }>>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
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

            {/* Name */}
            <Title as="h1" className="mb-2">{basic.name}</Title>

            {/* Description */}
            {basic.description && (
              <Content className="mb-4">{basic.description}</Content>
            )}

            {/* Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {authChecked &&
                isAuthenticated &&
                !isOwner &&
                isHumanPortfolio(portfolio) && (
                  <>
                    <FriendButton friendId={portfolio.user_id} />
                    <Button
                      variant="success"
                      asLink
                      href={`/messages?userId=${portfolio.user_id}`}
                    >
                      <UIText>Message</UIText>
                    </Button>
                  </>
                )}
              {authChecked && isAuthenticated && !isOwner && (
                <SubscribeButton portfolioId={portfolio.id} />
              )}
              {authChecked && isAuthenticated && (isOwner || isManager) && (
                <>
                  {isHumanPortfolio(portfolio) && isOwner && (
                    <Button
                      variant="secondary"
                      asLink
                      href={`/account/${portfolio.user_id}`}
                    >
                      <UIText>Account</UIText>
                    </Button>
                  )}
                  {(isOwner || isManager) && (
                    <>
                      <Button
                        variant="secondary"
                        asLink
                        href={`${getPortfolioUrl(portfolio.type, portfolio.id)}/pinned`}
                      >
                        <UIText>Edit Pinned</UIText>
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => setIsEditing(true)}
                      >
                        <UIText>Edit</UIText>
                      </Button>
                    </>
                  )}
                  {/* Delete button only for creator */}
                  {!isHumanPortfolio(portfolio) && isOwner && (
                    <Button
                      variant="danger"
                      onClick={handleDelete}
                      disabled={isDeleting}
                    >
                      <UIText>{isDeleting ? 'Deleting...' : 'Delete'}</UIText>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Projects Row (for all visitors, human portfolios only) */}
          {isHumanPortfolio(portfolio) && (
            <div className="mt-4 mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Apple className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
                <UIText>Involvement</UIText>
              </div>
              <div className="flex items-start gap-12 overflow-x-auto pt-2 pb-2">
                {projectsLoading ? (
                  <UIText className="text-gray-500">Loading projects...</UIText>
                ) : (
                  <>
                    {projects.map((project) => (
                      <div key={project.id} className="flex flex-col items-center gap-4 flex-shrink-0">
                        <StickerAvatar
                          src={project.avatar}
                          alt={project.name}
                          type="projects"
                          size={96}
                          href={getPortfolioUrl('projects', project.id)}
                          emoji={project.emoji}
                          name={project.name}
                        />
                        <UIText className="text-center max-w-[96px] truncate" title={project.name}>
                          {project.name}
                        </UIText>
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

          {/* Create Note Button - Show only for projects, if user is member/owner */}
          {authChecked && isAuthenticated && (isOwner || isMember) && isProjectPortfolio(portfolio) && (
            <div className="mb-6 pb-6">
              <Button
                variant="primary"
                asLink
                href={`/notes/create?portfolio=${portfolio.id}`}
              >
                <UIText>Create Note</UIText>
              </Button>
            </div>
          )}

          {/* Members and Managers (for projects and communities) */}
          {(isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio)) && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <UIText as="h2">Members</UIText>
                <Link
                  href={`${getPortfolioUrl(portfolio.type, portfolio.id)}/members`}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <UIText>View All →</UIText>
                </Link>
              </div>
              
              {/* Creator */}
              <div className="mb-4">
                <UIText as="h3" className="mb-2">Creator</UIText>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/portfolio/human/${portfolio.user_id}`}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
                  >
                    <UIText>{portfolio.user_id === currentUserId ? 'You (Creator)' : `User ${portfolio.user_id.slice(0, 8)} (Creator)`}</UIText>
                  </Link>
                </div>
              </div>

              {/* Managers */}
              {managers.length > 0 && (
                <div className="mb-4">
                  <UIText as="h3" className="mb-2">Managers</UIText>
                  <div className="flex flex-wrap gap-2">
                    {managers
                      .filter((managerId: string) => managerId !== portfolio.user_id) // Don't show creator in managers list
                      .slice(0, 5) // Show only first 5
                      .map((managerId: string) => (
                        <Link
                          key={managerId}
                          href={`/portfolio/human/${managerId}`}
                          className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 transition-colors"
                        >
                          <UIText>{managerId === currentUserId ? 'You (Manager)' : `User ${managerId.slice(0, 8)} (Manager)`}</UIText>
                        </Link>
                      ))}
                    {managers.filter((managerId: string) => managerId !== portfolio.user_id).length > 5 && (
                      <UIText as="span" className="px-3 py-1">
                        +{managers.filter((managerId: string) => managerId !== portfolio.user_id).length - 5} more
                      </UIText>
                    )}
                  </div>
                </div>
              )}

              {/* Members */}
              {members.length > 0 && (
                <div>
                  <UIText as="h3" className="mb-2">Members</UIText>
                  <div className="flex flex-wrap gap-2">
                    {members
                      .filter((memberId: string) => memberId !== portfolio.user_id && !managers.includes(memberId)) // Don't show creator or managers in members list
                      .slice(0, 5) // Show only first 5
                      .map((memberId: string) => (
                        <Link
                          key={memberId}
                          href={`/portfolio/human/${memberId}`}
                          className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                        >
                          <UIText>{memberId === currentUserId ? 'You' : `User ${memberId.slice(0, 8)}`}</UIText>
                        </Link>
                      ))}
                    {members.filter((memberId: string) => memberId !== portfolio.user_id && !managers.includes(memberId)).length > 5 && (
                      <UIText as="span" className="px-3 py-1">
                        +{members.filter((memberId: string) => memberId !== portfolio.user_id && !managers.includes(memberId)).length - 5} more
                      </UIText>
                    )}
                  </div>
                </div>
              )}
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
  )
}
