import { AuthForm } from '@/components/auth/AuthForm'
import Link from 'next/link'
import { Title, UIText } from '@/components/ui'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sanitizeReturnTo } from '@/lib/auth/login-redirect'

interface LoginPageProps {
  searchParams: {
    password_reset?: string
    error?: string
    returnTo?: string
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If already logged in, don't show the login page.
  // Blocked users are allowed to stay on login.
  if (user) {
    const metadata = user.user_metadata || {}
    const isBlocked = metadata.is_blocked === true

    if (!isBlocked) {
      redirect(sanitizeReturnTo(searchParams?.returnTo))
    }
  }

  const passwordResetSuccess = searchParams?.password_reset === 'success'

  return (
    <div className="flex items-center justify-center min-h-full">
      <div className="max-w-md w-full space-y-8 px-4 md:px-0">
        <div>
          <Title as="h1" className="mt-6 text-center">
            Continue with your email
          </Title>
          <UIText as="p" className="mt-2 text-center">
            Enter your email to sign in to an existing account or create a new one with email verification.
          </UIText>
        </div>
        {passwordResetSuccess && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm text-center">
            <UIText>Password reset successfully! You can now sign in with your new password.</UIText>
          </div>
        )}
        <AuthForm mode="login" />
        <div className="text-center">
          <Link href="/forgot-password" className="text-blue-600 hover:text-blue-500">
            <UIText>Forgot your password?</UIText>
          </Link>
        </div>
      </div>
    </div>
  )
}

