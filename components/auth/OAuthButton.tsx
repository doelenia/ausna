'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      console.error('OAuth error:', error)
      alert('Failed to sign in with ' + provider)
    }
  }

  return (
    <button
      onClick={handleOAuth}
      className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
    >
      {children}
    </button>
  )
}

