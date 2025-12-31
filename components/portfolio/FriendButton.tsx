'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
      <button
        disabled
        className={`px-4 py-2 bg-gray-400 text-white rounded-md cursor-not-allowed ${className}`}
      >
        Loading...
      </button>
    )
  }

  if (status === 'accepted') {
    return (
      <button
        onClick={handleUnfriend}
        disabled={isLoading}
        className={`px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 ${className}`}
      >
        {isLoading ? '...' : 'Unfriend'}
      </button>
    )
  }

  if (status === 'pending_sent') {
    return (
      <button
        disabled
        className={`px-4 py-2 bg-yellow-600 text-white rounded-md cursor-not-allowed ${className}`}
      >
        Friend Request Sent
      </button>
    )
  }

  if (status === 'pending_received') {
    return (
      <button
        onClick={handleAcceptRequest}
        disabled={isLoading}
        className={`px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 ${className}`}
      >
        {isLoading ? '...' : 'Accept Invite'}
      </button>
    )
  }

  return (
    <button
      onClick={handleSendRequest}
      disabled={isLoading}
      className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 ${className}`}
    >
      {isLoading ? '...' : 'Friend'}
    </button>
  )
}

