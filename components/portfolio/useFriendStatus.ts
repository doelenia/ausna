'use client'

import { useState, useEffect } from 'react'

export type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'loading'

export function useFriendStatus(friendId: string): FriendStatus {
  const [status, setStatus] = useState<FriendStatus>('loading')

  useEffect(() => {
    // Don't fetch if friendId is empty
    if (!friendId) {
      setStatus('none')
      return
    }

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

  return status
}

