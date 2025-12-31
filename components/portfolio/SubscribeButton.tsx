'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface SubscribeButtonProps {
  portfolioId: string
  initialSubscribed?: boolean
  className?: string
}

export function SubscribeButton({
  portfolioId,
  initialSubscribed = false,
  className = '',
}: SubscribeButtonProps) {
  const [isSubscribed, setIsSubscribed] = useState(initialSubscribed)
  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const router = useRouter()

  // Check subscription status on mount
  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const response = await fetch(`/api/subscriptions/${portfolioId}`)
        if (response.ok) {
          const data = await response.json()
          setIsSubscribed(data.subscribed || false)
        }
      } catch (error) {
        console.error('Error checking subscription:', error)
      } finally {
        setIsChecking(false)
      }
    }

    checkSubscription()
  }, [portfolioId])

  const handleToggle = async () => {
    setIsLoading(true)
    try {
      const method = isSubscribed ? 'DELETE' : 'POST'
      const response = await fetch(`/api/subscriptions/${portfolioId}`, {
        method,
      })

      if (response.ok) {
        setIsSubscribed(!isSubscribed)
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to update subscription')
      }
    } catch (error) {
      console.error('Error toggling subscription:', error)
      alert('Failed to update subscription')
    } finally {
      setIsLoading(false)
    }
  }

  if (isChecking) {
    return (
      <button
        disabled
        className={`px-4 py-2 bg-gray-400 text-white rounded-md cursor-not-allowed ${className}`}
      >
        Loading...
      </button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`px-4 py-2 rounded-md transition-colors font-medium ${
        isSubscribed
          ? 'bg-gray-600 text-white hover:bg-gray-700'
          : 'bg-blue-600 text-white hover:bg-blue-700'
      } disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {isLoading
        ? '...'
        : isSubscribed
        ? 'Unsubscribe'
        : 'Subscribe'}
    </button>
  )
}

