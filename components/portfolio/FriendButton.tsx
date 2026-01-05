'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, UIText } from '@/components/ui'
import { UserPlus, UserMinus, Check } from 'lucide-react'

interface FriendButtonProps {
  friendId: string
  className?: string
}

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'loading'

export function FriendButton({
  friendId,
  className = '',
}: FriendButtonProps) {
  const [status, setStatus] = useState<FriendStatus>('loading')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  // Check friend status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/friends/${friendId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.isFriend) {
            setStatus('accepted')
          } else if (data.status === 'pending_sent') {
            setStatus('pending_sent')
          } else if (data.status === 'pending_received') {
            setStatus('pending_received')
          } else {
            setStatus('none')
          }
        }
      } catch (error) {
        console.error('Error checking friend status:', error)
        setStatus('none')
      }
    }

    checkStatus()
  }, [friendId])

  const handleSendRequest = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/friends/${friendId}`, {
        method: 'POST',
      })

      if (response.ok) {
        setStatus('pending_sent')
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to send friend request')
      }
    } catch (error) {
      console.error('Error sending friend request:', error)
      alert('Failed to send friend request')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAcceptRequest = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/friends/${friendId}`, {
        method: 'PUT',
      })

      if (response.ok) {
        setStatus('accepted')
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to accept friend request')
      }
    } catch (error) {
      console.error('Error accepting friend request:', error)
      alert('Failed to accept friend request')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnfriend = async () => {
    if (!confirm('Are you sure you want to unfriend this user?')) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/friends/${friendId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setStatus('none')
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to unfriend')
      }
    } catch (error) {
      console.error('Error unfriending:', error)
      alert('Failed to unfriend')
    } finally {
      setIsLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <Button
        disabled
        variant="secondary"
        className={className}
      >
        <UIText>Loading...</UIText>
      </Button>
    )
  }

  if (status === 'accepted') {
    return (
      <Button
        onClick={handleUnfriend}
        disabled={isLoading}
        variant="secondary"
        className={className}
      >
        <UserMinus className="w-4 h-4 mr-2" strokeWidth={1.5} />
        <UIText>{isLoading ? '...' : 'Unfriend'}</UIText>
      </Button>
    )
  }

  if (status === 'pending_sent') {
    return (
      <Button
        disabled
        variant="secondary"
        className={className}
      >
        <UserPlus className="w-4 h-4 mr-2" strokeWidth={1.5} />
        <UIText>Friend Request Sent</UIText>
      </Button>
    )
  }

  if (status === 'pending_received') {
    return (
      <Button
        onClick={handleAcceptRequest}
        disabled={isLoading}
        variant="success"
        className={className}
      >
        <Check className="w-4 h-4 mr-2" strokeWidth={1.5} />
        <UIText>{isLoading ? '...' : 'Accept Invite'}</UIText>
      </Button>
    )
  }

  return (
    <Button
      onClick={handleSendRequest}
      disabled={isLoading}
      variant="primary"
      className={className}
    >
      <UserPlus className="w-4 h-4 mr-2" strokeWidth={1.5} />
      <UIText>{isLoading ? '...' : 'Friend'}</UIText>
    </Button>
  )
}

