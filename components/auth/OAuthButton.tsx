'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { getAuthCallbackUrl } from '@/lib/utils/site-url'

interface OAuthButtonProps {
  provider: 'google' | 'apple'
  children: React.ReactNode
}

export function OAuthButton({ provider, children }: OAuthButtonProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleOAuth = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getAuthCallbackUrl(),
      },
    })

    if (error) {
      console.error('OAuth error:', error)
      alert('Failed to sign in with ' + provider)
    }
  }

  return (
    <Button
      onClick={handleOAuth}
      variant="primary"
      fullWidth
      className="flex items-center justify-center gap-2"
    >
      {children}
    </Button>
  )
}


