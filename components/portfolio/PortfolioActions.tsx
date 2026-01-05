'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Portfolio, isHumanPortfolio, isProjectPortfolio } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { Button, UIText, Dropdown, DropdownItem } from '@/components/ui'
import { FriendButton } from './FriendButton'
import { useFriendStatus } from './useFriendStatus'
import { Edit, User, Share2, MessageCircle, UserMinus, Bell, BellOff, Trash2 } from 'lucide-react'

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
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(true)
  
  // Get friend status for human portfolios (always call hook, but only use result when needed)
  const friendStatus = useFriendStatus(
    isHumanPortfolio(portfolio) && currentUserId && !isOwner ? portfolio.user_id : ''
  )

  // Check subscription status for projects
  useEffect(() => {
    if (!isProjectPortfolio(portfolio) || isOwner || isMember) {
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
  }, [portfolio.id, portfolio.type, isOwner, isMember])

  const handleShare = () => {
    alert('Coming soon')
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

  if (!authChecked || !isAuthenticated) {
    return null
  }

  // Human portfolio - Owner view
  if (isHumanPortfolio(portfolio) && isOwner) {
    const dropdownItems: DropdownItem[] = []
    
    dropdownItems.push({
      label: 'Account',
      onClick: () => router.push(`/account/${portfolio.user_id}`),
      asLink: true,
      href: `/account/${portfolio.user_id}`,
      icon: User,
    })

    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={handleShare}>
          <Share2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Share</UIText>
        </Button>
        <Button
          variant="secondary"
          onClick={onEdit}
        >
          <Edit className="w-4 h-4 mr-2" strokeWidth={1.5} />
          <UIText>Edit Profile</UIText>
        </Button>
        {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}
      </div>
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

    // If not friend, show FriendButton (handles all friend request states)
    return (
      <div className="flex flex-wrap items-center gap-2">
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

  // Project portfolio - Non-member view
  if (isProjectPortfolio(portfolio) && !isOwner && !isMember) {
    const dropdownItems: DropdownItem[] = []

    return (
      <div className="flex flex-wrap items-center gap-2">
        {isCheckingSubscription ? (
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
            <Button variant="primary" onClick={handleSubscribe}>
              <Bell className="w-4 h-4 mr-2" strokeWidth={1.5} />
              <UIText>Subscribe</UIText>
            </Button>
            {dropdownItems.length > 0 && <Dropdown items={dropdownItems} />}
          </>
        )}
      </div>
    )
  }

  return null
}

