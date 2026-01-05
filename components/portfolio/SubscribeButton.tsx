'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, UIText } from '@/components/ui'

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
      <Button
        disabled
        variant="secondary"
        className={className}
      >
        <UIText>Loading...</UIText>
      </Button>
    )
  }

  return (
    <Button
      onClick={handleToggle}
      disabled={isLoading}
      variant={isSubscribed ? 'secondary' : 'primary'}
      className={className}
    >
      <UIText>
        {isLoading
          ? '...'
          : isSubscribed
          ? 'Unsubscribe'
          : 'Subscribe'}
      </UIText>
    </Button>
  )
}


