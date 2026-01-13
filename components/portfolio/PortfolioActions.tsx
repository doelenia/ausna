'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Portfolio, isHumanPortfolio, isProjectPortfolio, isCommunityPortfolio } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { Button, UIText, Dropdown, DropdownItem, Card } from '@/components/ui'
import { FriendButton } from './FriendButton'
import { useFriendStatus } from './useFriendStatus'
import { Edit, User, Share2, MessageCircle, UserMinus, Bell, BellOff, Trash2, Pen } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StickerAvatar } from './StickerAvatar'

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
}: PortfolioActionsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(true)
  const [showProjectSelector, setShowProjectSelector] = useState(false)
  const [userProjects, setUserProjects] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string }>>([])
  const [userProjectsLoading, setUserProjectsLoading] = useState(false)
  
  // Get friend status for human portfolios (always call hook, but only use result when needed)
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

  // Fetch all projects user is a member of (for project selector popup)
  useEffect(() => {
    const fetchUserProjects = async () => {
      if (!currentUserId || !isHumanPortfolio(portfolio) || !isOwner) {
        return
      }

      setUserProjectsLoading(true)
      try {
        // Fetch all projects
        const { data: allProjects } = await supabase
          .from('portfolios')
          .select('id, metadata')
          .eq('type', 'projects')
          .order('created_at', { ascending: false })

        if (!allProjects) {
          setUserProjects([])
          setUserProjectsLoading(false)
          return
        }

        // Filter projects where user is a manager or member
        const userProjectData = allProjects
          .filter((p: any) => {
            const metadata = p.metadata as any
            const managers = metadata?.managers || []
            const members = metadata?.members || []
            return p.user_id === currentUserId || // Creator
                   (Array.isArray(managers) && managers.includes(currentUserId)) ||
                   (Array.isArray(members) && members.includes(currentUserId))
          })
          .map((p: any) => {
            const metadata = p.metadata as any
            const basic = metadata?.basic || {}
            return {
              id: p.id,
              name: basic.name || 'Project',
              avatar: basic.avatar,
              emoji: basic.emoji,
            }
          })

        setUserProjects(userProjectData)
      } catch (error) {
        console.error('Failed to fetch user projects:', error)
        setUserProjects([])
      } finally {
        setUserProjectsLoading(false)
      }
    }

    fetchUserProjects()
  }, [currentUserId, isHumanPortfolio(portfolio), isOwner, supabase])

  const handleShare = () => {
    alert('Share feature coming soon!')
  }

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

  // For human portfolios, require authentication (Friend/Message buttons need auth)
  // For project/community portfolios, Share button is visible to everyone
  if (isHumanPortfolio(portfolio) && !isAuthenticated) {
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
      onClick: () => router.push(`/account/${portfolio.user_id}`),
      asLink: true,
      href: `/account/${portfolio.user_id}`,
      icon: User,
    })

    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => setShowProjectSelector(true)}>
            <Pen className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Create Note</UIText>
          </Button>
          <Button variant="secondary" onClick={handleShare}>
            <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
            <UIText>Share</UIText>
          </Button>
          {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}
        </div>

        {/* Project Selector Popup */}
        {showProjectSelector && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]"
            onClick={() => setShowProjectSelector(false)}
          >
            <div 
              className="bg-white rounded-xl w-auto mx-4 max-h-[80vh] overflow-y-auto z-[101]"
              onClick={(e) => e.stopPropagation()}
            >
              <Card variant="default" padding="sm">
                <div className="mb-6">
                  <UIText>Choose a project to post note with</UIText>
                </div>
                
                {userProjectsLoading ? (
                  <div className="py-8 text-center">
                    <UIText className="text-gray-500">Loading projects...</UIText>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-x-4 gap-y-8 mb-4">
                    {userProjects.map((project) => (
                      <Link
                        key={project.id}
                        href={`/notes/create?portfolio=${project.id}`}
                        className="flex flex-col items-center gap-4 py-8 px-8 hover:opacity-80 transition-opacity"
                        onClick={() => setShowProjectSelector(false)}
                      >
                        <StickerAvatar
                          src={project.avatar}
                          alt={project.name}
                          type="projects"
                          size={96}
                          emoji={project.emoji}
                          name={project.name}
                        />
                        <UIText className="text-center max-w-[96px] truncate" title={project.name}>
                          {project.name}
                        </UIText>
                      </Link>
                    ))}
                    {/* Create Project Button */}
                    <Link
                      href="/portfolio/create/projects"
                      className="flex flex-col items-center gap-4 py-4 px-4 hover:opacity-80 transition-opacity"
                      onClick={() => setShowProjectSelector(false)}
                    >
                      <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
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
                      </div>
                      <UIText className="text-center max-w-[96px] truncate">Create Project</UIText>
                    </Link>
                  </div>
                )}
                
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => setShowProjectSelector(false)}
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
    
    // If friend, show Share and Message buttons, with Unfriend in dropdown
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
        </div>
      )
    }

    // If not friend, show Share button and FriendButton
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={handleShare}>
          <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Share</UIText>
        </Button>
        <FriendButton friendId={portfolio.user_id} />
        {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}
      </div>
    )
  }

  // Project portfolio - Member view
  if (isProjectPortfolio(portfolio) && (isOwner || isManager || isMember)) {
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

    const handleCreateNote = () => {
      router.push(`/notes/create?portfolio=${portfolio.id}`)
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={handleCreateNote}>
          <Pen className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Create Note</UIText>
        </Button>
        <Button variant="secondary" onClick={handleShare}>
          <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Share</UIText>
        </Button>
        {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}
      </div>
    )
  }

  // Project portfolio - Non-member view
  if (isProjectPortfolio(portfolio) && !isOwner && !isMember) {
    const dropdownItems: DropdownItem[] = []

    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={handleShare}>
          <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Share</UIText>
        </Button>
        {/* Only show Subscribe/Unsubscribe buttons if authenticated */}
        {isAuthenticated && (
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
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={handleShare}>
          <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Share</UIText>
        </Button>
        {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}
      </div>
    )
  }

  // Community portfolio - Non-member view (visitor)
  if (isCommunityPortfolio(portfolio) && !isOwner && !isMember) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={handleShare}>
          <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Share</UIText>
        </Button>
      </div>
    )
  }

  return null
}

