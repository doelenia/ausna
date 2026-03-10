'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Portfolio, isHumanPortfolio, isProjectPortfolio, isCommunityPortfolio, isActivityPortfolio } from '@/types/portfolio'
import { getPortfolioUrl, getPortfolioUrlWithSlug } from '@/lib/portfolio/routes'
import { Button, UIText, Dropdown, DropdownItem, Card } from '@/components/ui'
import { FriendButton } from './FriendButton'
import { useFriendStatus } from './useFriendStatus'
import { Edit, User, Share2, MessageCircle, UserMinus, Bell, BellOff, Trash2, Pen, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StickerAvatar } from './StickerAvatar'
import { AddContactDialog } from '@/components/contacts/AddContactDialog'
import { SendItemModal } from '@/components/messages/SendItemModal'
import { buildLoginHref } from '@/lib/auth/login-redirect'

interface PortfolioActionsProps {
  portfolio: Portfolio
  isOwner: boolean
  isManager: boolean
  isMember: boolean
  isAuthenticated: boolean
  authChecked: boolean
  currentUserId?: string
  onEdit: () => void
  onDelete: () => void
  isDeleting: boolean
  /** When provided and portfolio is community, visitor can open the request-to-join modal */
  onOpenCommunityJoin?: () => void
}

export function PortfolioActions({
  portfolio,
  isOwner,
  isManager,
  isMember,
  isAuthenticated,
  authChecked,
  currentUserId,
  onEdit,
  onDelete,
  isDeleting,
  onOpenCommunityJoin,
}: PortfolioActionsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [showSendModal, setShowSendModal] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(true)
  const [showProjectSelector, setShowProjectSelector] = useState(false)
  const [showCreateTypePrompt, setShowCreateTypePrompt] = useState(false)
  const [createTypeChoice, setCreateTypeChoice] = useState<'note' | 'open_call' | null>(null)
  const [showProjectActivityCreatePrompt, setShowProjectActivityCreatePrompt] = useState(false)
const [userProjects, setUserProjects] = useState<
  Array<{ id: string; name: string; avatar?: string; emoji?: string }>
>([])
const [userProjectsLoading, setUserProjectsLoading] = useState(false)
const [userCommunities, setUserCommunities] = useState<
  Array<{ id: string; name: string; avatar?: string; emoji?: string }>
>([])
const [userCommunitiesLoading, setUserCommunitiesLoading] = useState(false)
  const [showAddContactDialog, setShowAddContactDialog] = useState(false)

  const getCurrentReturnTo = () => {
    if (typeof window === 'undefined') return '/main'
    return `${window.location.pathname}${window.location.search}${window.location.hash}`
  }
  const loginHref = buildLoginHref({ returnTo: getCurrentReturnTo() })
  
  // Get friend status for human portfolios (always call hook, but only use result when needed).
  // IMPORTANT: when we pass an id into friend-related APIs/components it is always the
  // auth user id (never a human portfolio id). For human portfolios that user id lives
  // on `portfolio.user_id`, while `portfolio.id` is the portfolio row id.
  const friendStatus = useFriendStatus(
    isHumanPortfolio(portfolio) && currentUserId && !isOwner ? portfolio.user_id : ''
  )

  // Check subscription status for projects (only if authenticated)
  useEffect(() => {
    if (!isProjectPortfolio(portfolio) || isOwner || isMember || !isAuthenticated) {
      setIsCheckingSubscription(false)
      return
    }

    const checkSubscription = async () => {
      try {
        const response = await fetch(`/api/subscriptions/${portfolio.id}`)
        if (response.ok) {
          const data = await response.json()
          setIsSubscribed(data.subscribed || false)
        }
      } catch (error) {
        console.error('Error checking subscription:', error)
      } finally {
        setIsCheckingSubscription(false)
      }
    }

    checkSubscription()
  }, [portfolio.id, portfolio.type, isOwner, isMember, isAuthenticated])

  // Fetch all projects and communities user can post in (for selector popup)
  useEffect(() => {
    const fetchUserPortfolios = async () => {
      if (!currentUserId || !isHumanPortfolio(portfolio) || !isOwner) {
        return
      }

      setUserProjectsLoading(true)
      setUserCommunitiesLoading(true)
      try {
        const { data: allProjects } = await supabase
          .from('portfolios')
          .select('id, user_id, metadata')
          .eq('type', 'projects')
          .order('created_at', { ascending: false })

        const { data: allCommunities } = await supabase
          .from('portfolios')
          .select('id, user_id, metadata')
          .eq('type', 'community')
          .order('created_at', { ascending: false })

        if (!allProjects) {
          setUserProjects([])
        } else {
          const userProjectData = allProjects
            .filter((p: any) => {
              const metadata = p.metadata as any
              const managers = metadata?.managers || []
              const members = metadata?.members || []
              return (
                p.user_id === currentUserId ||
                (Array.isArray(managers) && managers.includes(currentUserId)) ||
                (Array.isArray(members) && members.includes(currentUserId))
              )
            })
            .map((p: any) => {
              const metadata = p.metadata as any
              const basic = metadata?.basic || {}
              return {
                id: p.id as string,
                name: (basic.name as string) || 'Project',
                avatar: basic.avatar as string | undefined,
                emoji: basic.emoji as string | undefined,
              }
            })

          setUserProjects(userProjectData)
        }

        if (!allCommunities) {
          setUserCommunities([])
        } else {
          const userCommunityData = allCommunities
            .filter((c: any) => {
              const metadata = c.metadata as any
              const managers = metadata?.managers || []
              const members = metadata?.members || []
              return (
                c.user_id === currentUserId ||
                (Array.isArray(managers) && managers.includes(currentUserId)) ||
                (Array.isArray(members) && members.includes(currentUserId))
              )
            })
            .map((c: any) => {
              const metadata = c.metadata as any
              const basic = metadata?.basic || {}
              return {
                id: c.id as string,
                name: (basic.name as string) || 'Community',
                avatar: basic.avatar as string | undefined,
                emoji: basic.emoji as string | undefined,
              }
            })

          setUserCommunities(userCommunityData)
        }
      } catch (error) {
        console.error('Failed to fetch user projects/communities:', error)
        setUserProjects([])
        setUserCommunities([])
      } finally {
        setUserProjectsLoading(false)
        setUserCommunitiesLoading(false)
      }
    }

    fetchUserPortfolios()
  }, [currentUserId, isHumanPortfolio(portfolio), isOwner, supabase])

  // NOTE: Approval for creating new projects is now enforced at the database level
  // via is_current_user_approved(), which uses non-pseudo human portfolios (is_pseudo = false).
  // The UI here no longer needs a separate isApproved state; any failing attempts will be blocked by RLS.

  const handleShare = () => {
    if (!isAuthenticated) {
      router.push(loginHref)
      return
    }
    setShowSendModal(true)
  }

  const portfolioPath = portfolio.slug
    ? getPortfolioUrlWithSlug(portfolio.type, portfolio.slug)
    : getPortfolioUrl(portfolio.type, portfolio.id)
  const portfolioLink =
    typeof window !== 'undefined' ? `${window.location.origin}${portfolioPath}` : portfolioPath
  // Use a predictable reference so the Messages UI can render a clickable portfolio module.
  const shareText = `Shared a portfolio. View details: ${portfolioPath}`

  const handleUnfriend = async () => {
    if (!confirm('Are you sure you want to unfriend this user?')) {
      return
    }

    try {
      const response = await fetch(`/api/friends/${portfolio.user_id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to unfriend')
      }
    } catch (error) {
      console.error('Error unfriending:', error)
      alert('Failed to unfriend')
    }
  }

  const handleUnsubscribe = async () => {
    try {
      const response = await fetch(`/api/subscriptions/${portfolio.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setIsSubscribed(false)
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to unsubscribe')
      }
    } catch (error) {
      console.error('Error unsubscribing:', error)
      alert('Failed to unsubscribe')
    }
  }

  const handleSubscribe = async () => {
    try {
      const response = await fetch(`/api/subscriptions/${portfolio.id}`, {
        method: 'POST',
      })

      if (response.ok) {
        setIsSubscribed(true)
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to subscribe')
      }
    } catch (error) {
      console.error('Error subscribing:', error)
      alert('Failed to subscribe')
    }
  }

  // Wait for auth check to complete before rendering buttons
  // This prevents flashing and ensures we have correct auth state
  if (!authChecked) {
    return null
  }

  // Human portfolio - Owner view
  if (isHumanPortfolio(portfolio) && isOwner) {
    const dropdownItems: DropdownItem[] = []
    
    dropdownItems.push({
      label: 'Edit Profile',
      onClick: onEdit,
      icon: Edit,
    })
    
    dropdownItems.push({
      label: 'Account',
      asLink: true,
      href: `/account/${portfolio.user_id}`,
      icon: User,
    })

    dropdownItems.push({
      label: 'Share profile',
      onClick: handleShare,
      icon: Share2,
    })

    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => setShowCreateTypePrompt(true)}>
            <Pen className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Create Note</UIText>
          </Button>
          <Button variant="secondary" onClick={() => setShowAddContactDialog(true)}>
            <UserPlus className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Add contact</UIText>
          </Button>
          {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}
        </div>

        {showSendModal && (
          <SendItemModal
            isOpen={showSendModal}
            onClose={() => setShowSendModal(false)}
            currentUserId={currentUserId || null}
            itemLabel="portfolio"
            copyLink={portfolioLink}
            sendPayload={{ text: shareText, messageType: 'portfolio_share' }}
          />
        )}

        {showAddContactDialog && (
          <AddContactDialog
            isOpen={showAddContactDialog}
            onClose={() => setShowAddContactDialog(false)}
            ownerUserId={portfolio.user_id}
          />
        )}

        {/* Create Type Prompt - Create Open Call or Create Note */}
        {showCreateTypePrompt && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]"
            onClick={() => setShowCreateTypePrompt(false)}
          >
            <div
              className="bg-white rounded-xl w-auto mx-4 max-w-md p-6 z-[101]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4">
                <UIText>What would you like to create?</UIText>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    setCreateTypeChoice('open_call')
                    setShowCreateTypePrompt(false)
                    setShowProjectSelector(true)
                  }}
                >
                  <UIText>Create Open Call</UIText>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCreateTypeChoice('note')
                    setShowCreateTypePrompt(false)
                    setShowProjectSelector(true)
                  }}
                >
                  <UIText>Create Note</UIText>
                </Button>
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="secondary" onClick={() => setShowCreateTypePrompt(false)}>
                  <UIText>Cancel</UIText>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Project Selector Popup */}
        {showProjectSelector && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]"
            onClick={() => {
              setShowProjectSelector(false)
              setCreateTypeChoice(null)
            }}
          >
            <div
              className="bg-white rounded-xl w-auto mx-4 max-h-[80vh] overflow-y-auto z-[101]"
              onClick={(e) => e.stopPropagation()}
            >
              <Card variant="default" padding="sm">
                <div className="mb-6">
                  <UIText>
                    {createTypeChoice === 'open_call'
                      ? 'Choose a project or community to post open call with'
                      : 'Choose a project or community to post note with'}
                  </UIText>
                </div>

                {userProjectsLoading && userCommunitiesLoading ? (
                  <div className="py-8 text-center">
                    <UIText className="text-gray-500">Loading portfolios...</UIText>
                  </div>
                ) : (
                  <>
                    {userProjects.length > 0 && (
                      <div className="mb-6">
                        <UIText as="p" className="mb-2 font-medium text-gray-700">
                          Projects
                        </UIText>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-8">
                          {userProjects.map((project) => (
                            <Link
                              key={project.id}
                              href={
                                createTypeChoice === 'open_call'
                                  ? `/notes/create/open-call?portfolio=${project.id}`
                                  : `/notes/create?portfolio=${project.id}`
                              }
                              className="flex flex-col items-center gap-4 py-8 px-8 hover:opacity-80 transition-opacity"
                              onClick={() => {
                                setShowProjectSelector(false)
                                setCreateTypeChoice(null)
                              }}
                            >
                              <StickerAvatar
                                src={project.avatar}
                                alt={project.name}
                                type="projects"
                                size={96}
                                emoji={project.emoji}
                                name={project.name}
                              />
                              <UIText
                                className="text-center max-w-[96px] truncate"
                                title={project.name}
                              >
                                {project.name}
                              </UIText>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {userCommunities.length > 0 && (
                      <div className="mb-4">
                        <UIText as="p" className="mb-2 font-medium text-gray-700">
                          Communities
                        </UIText>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-8">
                          {userCommunities.map((community) => (
                            <Link
                              key={community.id}
                              href={
                                createTypeChoice === 'open_call'
                                  ? `/notes/create/open-call?portfolio=${community.id}`
                                  : `/notes/create?portfolio=${community.id}`
                              }
                              className="flex flex-col items-center gap-4 py-8 px-8 hover:opacity-80 transition-opacity"
                              onClick={() => {
                                setShowProjectSelector(false)
                                setCreateTypeChoice(null)
                              }}
                            >
                              <StickerAvatar
                                src={community.avatar}
                                alt={community.name}
                                type="community"
                                size={96}
                                emoji={community.emoji}
                                name={community.name}
                              />
                              <UIText
                                className="text-center max-w-[96px] truncate"
                                title={community.name}
                              >
                                {community.name}
                              </UIText>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {userProjects.length === 0 && userCommunities.length === 0 && (
                      <UIText className="text-gray-500 text-sm mb-4">
                        You are not a member of any projects or communities yet.
                      </UIText>
                    )}
                  </>
                )}

                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowProjectSelector(false)
                      setCreateTypeChoice(null)
                    }}
                  >
                    <UIText>Cancel</UIText>
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        )}
      </>
    )
  }

  // Human portfolio - Visitor view
  if (isHumanPortfolio(portfolio) && !isOwner) {
    const dropdownItems: DropdownItem[] = []
    const isFriend = currentUserId && friendStatus === 'accepted'
    
    // If friend, show Share and Message buttons, with Unfriend in dropdown.
    // NOTE: `/messages` and `/api/friends` both expect auth user ids;
    // we therefore always use `portfolio.user_id` here.
    if (isFriend) {
      dropdownItems.push({
        label: 'Unfriend',
        onClick: handleUnfriend,
        variant: 'danger',
        icon: UserMinus,
      })

      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={handleShare}>
            <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Share</UIText>
          </Button>
          <Button
            variant="secondary"
            asLink
            href={`/messages?userId=${portfolio.user_id}`}
          >
            <MessageCircle className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Message</UIText>
          </Button>
          {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}

          {showSendModal && (
            <SendItemModal
              isOpen={showSendModal}
              onClose={() => setShowSendModal(false)}
              currentUserId={currentUserId || null}
              itemLabel="portfolio"
              copyLink={portfolioLink}
              sendPayload={{ text: shareText, messageType: 'portfolio_share' }}
            />
          )}
        </div>
      )
    }

    // Logged-out visitors: show interactive buttons that redirect to login.
    if (!isAuthenticated) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => router.push(loginHref)}>
            <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Share</UIText>
          </Button>
          <Button variant="secondary" onClick={() => router.push(loginHref)}>
            <MessageCircle className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Message</UIText>
          </Button>
          <Button variant="secondary" onClick={() => router.push(loginHref)}>
            <UserPlus className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Friend</UIText>
          </Button>
        </div>
      )
    }

    // If not friend, show Share button and FriendButton. FriendButton's `friendId`
    // prop is also always an auth user id.
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={handleShare}>
          <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Share</UIText>
        </Button>
        <FriendButton friendId={portfolio.user_id} />
        {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}

        {showSendModal && (
          <SendItemModal
            isOpen={showSendModal}
            onClose={() => setShowSendModal(false)}
            currentUserId={currentUserId || null}
            itemLabel="portfolio"
            copyLink={portfolioLink}
            sendPayload={{ text: shareText, messageType: 'portfolio_share' }}
          />
        )}
      </div>
    )
  }

  // Project or Activity portfolio - Member view
  if ((isProjectPortfolio(portfolio) || isActivityPortfolio(portfolio)) && (isOwner || isManager || isMember)) {
    const dropdownItems: DropdownItem[] = []

    if (isOwner || isManager) {
      dropdownItems.push({
        label: 'Edit',
        onClick: onEdit,
        icon: Edit,
      })
      
      if (isOwner) {
        dropdownItems.push({
          label: 'Delete',
          onClick: onDelete,
          variant: 'danger',
          disabled: isDeleting,
          icon: Trash2,
        })
      }
    }

    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => setShowProjectActivityCreatePrompt(true)}
          >
            <Pen className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Create Note</UIText>
          </Button>
        <Button variant="secondary" onClick={handleShare}>
          <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Share</UIText>
        </Button>
        {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}
      </div>

        {showSendModal && (
          <SendItemModal
            isOpen={showSendModal}
            onClose={() => setShowSendModal(false)}
            currentUserId={currentUserId || null}
            itemLabel="portfolio"
            copyLink={portfolioLink}
            sendPayload={{ text: shareText, messageType: 'portfolio_share' }}
          />
        )}

        {/* Project/Activity Create Type Prompt */}
        {showProjectActivityCreatePrompt && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]"
            onClick={() => setShowProjectActivityCreatePrompt(false)}
          >
            <div
              className="bg-white rounded-xl w-auto mx-4 max-w-md p-6 z-[101]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4">
                <UIText>What would you like to create?</UIText>
              </div>
              <div className="flex flex-col gap-2">
                <Link
                  href={`/notes/create/open-call?portfolio=${portfolio.id}`}
                  onClick={() => setShowProjectActivityCreatePrompt(false)}
                >
                  <Button variant="primary" className="w-full">
                    <UIText>Create Open Call</UIText>
                  </Button>
                </Link>
                <Link
                  href={`/notes/create?portfolio=${portfolio.id}`}
                  onClick={() => setShowProjectActivityCreatePrompt(false)}
                >
                  <Button variant="secondary" className="w-full">
                    <UIText>Create Note</UIText>
                  </Button>
                </Link>
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="secondary" onClick={() => setShowProjectActivityCreatePrompt(false)}>
                  <UIText>Cancel</UIText>
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // Project or Activity portfolio - Non-member view
  if ((isProjectPortfolio(portfolio) || isActivityPortfolio(portfolio)) && !isOwner && !isMember) {
    const dropdownItems: DropdownItem[] = []

    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={handleShare}>
          <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Share</UIText>
        </Button>
        {isAuthenticated ? (
          isCheckingSubscription ? (
            <Button disabled variant="secondary">
              <UIText>Loading...</UIText>
            </Button>
          ) : isSubscribed ? (
            <>
              <Button variant="secondary" onClick={handleUnsubscribe}>
                <BellOff className="w-4 h-4 mr-2" strokeWidth={1.5} />
                <UIText>Unsubscribe</UIText>
              </Button>
              {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={handleSubscribe}>
                <Bell className="w-4 h-4 mr-2" strokeWidth={1.5} />
                <UIText>Subscribe</UIText>
              </Button>
              {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}
            </>
          )
        ) : (
          <Button variant="secondary" onClick={() => router.push(loginHref)}>
            <Bell className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Subscribe</UIText>
          </Button>
        )}

        {showSendModal && (
          <SendItemModal
            isOpen={showSendModal}
            onClose={() => setShowSendModal(false)}
            currentUserId={currentUserId || null}
            itemLabel="portfolio"
            copyLink={portfolioLink}
            sendPayload={{ text: shareText, messageType: 'portfolio_share' }}
          />
        )}
      </div>
    )
  }

  // Community portfolio - Member view
  if (isCommunityPortfolio(portfolio) && (isOwner || isManager || isMember)) {
    const dropdownItems: DropdownItem[] = []
    
    if (isOwner || isManager) {
      dropdownItems.push({
        label: 'Edit',
        onClick: onEdit,
        icon: Edit,
      })
      
      if (isOwner) {
        dropdownItems.push({
          label: 'Delete',
          onClick: onDelete,
          variant: 'danger',
          disabled: isDeleting,
          icon: Trash2,
        })
      }
    }

    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => setShowProjectActivityCreatePrompt(true)}
          >
            <Pen className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Create Note</UIText>
          </Button>
          <Button variant="secondary" onClick={handleShare}>
            <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Share</UIText>
          </Button>
          {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}
        </div>

        {showSendModal && (
          <SendItemModal
            isOpen={showSendModal}
            onClose={() => setShowSendModal(false)}
            currentUserId={currentUserId || null}
            itemLabel="portfolio"
            copyLink={portfolioLink}
            sendPayload={{ text: shareText, messageType: 'portfolio_share' }}
          />
        )}

        {showProjectActivityCreatePrompt && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]"
            onClick={() => setShowProjectActivityCreatePrompt(false)}
          >
            <div
              className="bg-white rounded-xl w-auto mx-4 max-w-md p-6 z-[101]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4">
                <UIText>What would you like to create?</UIText>
              </div>
              <div className="flex flex-col gap-2">
                <Link
                  href={`/notes/create/open-call?portfolio=${portfolio.id}`}
                  onClick={() => setShowProjectActivityCreatePrompt(false)}
                >
                  <Button variant="primary" className="w-full">
                    <UIText>Create Open Call</UIText>
                  </Button>
                </Link>
                <Link
                  href={`/notes/create?portfolio=${portfolio.id}`}
                  onClick={() => setShowProjectActivityCreatePrompt(false)}
                >
                  <Button variant="secondary" className="w-full">
                    <UIText>Create Note</UIText>
                  </Button>
                </Link>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="secondary"
                  onClick={() => setShowProjectActivityCreatePrompt(false)}
                >
                  <UIText>Cancel</UIText>
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // Community portfolio - Non-member view (visitor)
  if (isCommunityPortfolio(portfolio) && !isOwner && !isMember) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {onOpenCommunityJoin && (
          <Button
            variant="primary"
            onClick={() => {
              if (!isAuthenticated) {
                router.push(loginHref)
                return
              }
              onOpenCommunityJoin()
            }}
          >
            <UserPlus className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Join</UIText>
          </Button>
        )}
        <Button variant="primary" onClick={handleShare}>
          <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Share</UIText>
        </Button>

        {showSendModal && (
          <SendItemModal
            isOpen={showSendModal}
            onClose={() => setShowSendModal(false)}
            currentUserId={currentUserId || null}
            itemLabel="portfolio"
            copyLink={portfolioLink}
          sendPayload={{ text: shareText, messageType: 'portfolio_share' }}
          />
        )}
      </div>
    )
  }

  return null
}

