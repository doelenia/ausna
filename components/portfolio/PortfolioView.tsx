'use client'

import { Portfolio, isProjectPortfolio, isCommunityPortfolio, isHumanPortfolio } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import Link from 'next/link'
import { PortfolioEditor } from './PortfolioEditor'
import { PinnedSection } from './PinnedSection'
import { SubscribeButton } from './SubscribeButton'
import { FriendButton } from './FriendButton'
import { InterestTags } from './InterestTags'
import { Topic } from '@/types/indexing'
import { useState, useEffect } from 'react'
import { deletePortfolio } from '@/app/portfolio/[type]/[id]/actions'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
}

export function PortfolioView({ portfolio, basic, isOwner: serverIsOwner, currentUserId, topInterests = [] }: PortfolioViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const [isMember, setIsMember] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const router = useRouter()
  const supabase = createClient()

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
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          {/* Header with avatar and name */}
          <div className="flex items-start gap-6 mb-6">
            {basic.avatar ? (
              <Link
                href={`/portfolio/human/${portfolio.user_id}`}
                className="flex-shrink-0"
              >
                <img
                  src={basic.avatar}
                  alt={basic.name}
                  className="h-24 w-24 rounded-full object-cover border-2 border-gray-300 hover:border-blue-500 transition-colors cursor-pointer"
                />
              </Link>
            ) : (
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
            )}
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-3xl font-bold mb-2">{basic.name}</h1>
                  <span className="inline-block px-2 py-1 text-xs font-semibold text-blue-600 bg-blue-100 rounded uppercase">
                    {portfolio.type}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {authChecked &&
                    isAuthenticated &&
                    !isOwner &&
                    isHumanPortfolio(portfolio) && (
                      <>
                        <FriendButton friendId={portfolio.user_id} />
                        <Link
                          href={`/messages?userId=${portfolio.user_id}`}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                        >
                          Message
                        </Link>
                      </>
                    )}
                  {authChecked && isAuthenticated && !isOwner && (
                    <SubscribeButton portfolioId={portfolio.id} />
                  )}
                  {authChecked && isAuthenticated && (isOwner || isManager) && (
                  <div className="flex gap-2">
                    {isHumanPortfolio(portfolio) && isOwner && (
                      <Link
                        href={`/account/${portfolio.user_id}`}
                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                      >
                        Account
                      </Link>
                    )}
                    {(isOwner || isManager) && (
                      <>
                        <Link
                          href={`${getPortfolioUrl(portfolio.type, portfolio.id)}/pinned`}
                          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                        >
                          Edit Pinned
                        </Link>
                        <button
                          onClick={() => setIsEditing(true)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                          Edit
                        </button>
                      </>
                    )}
                    {/* Delete button only for creator */}
                    {!isHumanPortfolio(portfolio) && isOwner && (
                      <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                    )}
                  </div>
                  )}
                </div>
              </div>
              {basic.description && (
                <p className="text-gray-600 mt-4">{basic.description}</p>
              )}
              {isHumanPortfolio(portfolio) && topInterests.length > 0 && (
                <InterestTags topics={topInterests} />
              )}
            </div>
          </div>

          {/* Owner Actions - Create Project/Community (only for human portfolios) */}
          {authChecked && isOwner && isAuthenticated && isHumanPortfolio(portfolio) && (
            <div className="mb-6 pb-6 border-b border-gray-200">
              <h2 className="text-sm font-medium text-gray-700 mb-3">Create New Portfolio</h2>
              <div className="flex gap-2">
                <Link
                  href="/portfolio/create/projects"
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  Create Project
                </Link>
                <Link
                  href="/portfolio/create/community"
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                >
                  Create Community
                </Link>
              </div>
            </div>
          )}

          {/* Create Note Button - Show only for projects, if user is member/owner */}
          {authChecked && isAuthenticated && (isOwner || isMember) && isProjectPortfolio(portfolio) && (
            <div className="mb-6 pb-6 border-b border-gray-200">
              <Link
                href={`/notes/create?portfolio=${portfolio.id}`}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors inline-block"
              >
                Create Note
              </Link>
            </div>
          )}

          {/* Members and Managers (for projects and communities) */}
          {(isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio)) && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">Members</h2>
                <Link
                  href={`${getPortfolioUrl(portfolio.type, portfolio.id)}/members`}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  View All →
                </Link>
              </div>
              
              {/* Creator */}
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Creator</h3>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/portfolio/human/${portfolio.user_id}`}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200 transition-colors font-medium"
                  >
                    {portfolio.user_id === currentUserId ? 'You (Creator)' : `User ${portfolio.user_id.slice(0, 8)} (Creator)`}
                  </Link>
                </div>
              </div>

              {/* Managers */}
              {managers.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Managers</h3>
                  <div className="flex flex-wrap gap-2">
                    {managers
                      .filter((managerId: string) => managerId !== portfolio.user_id) // Don't show creator in managers list
                      .slice(0, 5) // Show only first 5
                      .map((managerId: string) => (
                        <Link
                          key={managerId}
                          href={`/portfolio/human/${managerId}`}
                          className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm hover:bg-purple-200 transition-colors"
                        >
                          {managerId === currentUserId ? 'You (Manager)' : `User ${managerId.slice(0, 8)} (Manager)`}
                        </Link>
                      ))}
                    {managers.filter((managerId: string) => managerId !== portfolio.user_id).length > 5 && (
                      <span className="px-3 py-1 text-gray-500 text-sm">
                        +{managers.filter((managerId: string) => managerId !== portfolio.user_id).length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Members */}
              {members.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Members</h3>
                  <div className="flex flex-wrap gap-2">
                    {members
                      .filter((memberId: string) => memberId !== portfolio.user_id && !managers.includes(memberId)) // Don't show creator or managers in members list
                      .slice(0, 5) // Show only first 5
                      .map((memberId: string) => (
                        <Link
                          key={memberId}
                          href={`/portfolio/human/${memberId}`}
                          className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                        >
                          {memberId === currentUserId ? 'You' : `User ${memberId.slice(0, 8)}`}
                        </Link>
                      ))}
                    {members.filter((memberId: string) => memberId !== portfolio.user_id && !managers.includes(memberId)).length > 5 && (
                      <span className="px-3 py-1 text-gray-500 text-sm">
                        +{members.filter((memberId: string) => memberId !== portfolio.user_id && !managers.includes(memberId)).length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pinned Section */}
          <PinnedSection portfolioId={portfolio.id} />

          {/* Metadata */}
          <div className="text-sm text-gray-500 mt-6 pt-6 border-t border-gray-200">
            <span>Created: {new Date(portfolio.created_at).toLocaleDateString()}</span>
            {portfolio.updated_at !== portfolio.created_at && (
              <span className="ml-4">
                Updated: {new Date(portfolio.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* All Button */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <Link
              href={`/portfolio/${portfolio.type}/${portfolio.id}/all`}
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              View All
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
