import { AuthForm } from '@/components/auth/AuthForm'
import Link from 'next/link'
import { Title, Content, UIText } from '@/components/ui'

interface LoginPageProps {
  searchParams: {
    password_reset?: string
    error?: string
  }
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const passwordResetSuccess = searchParams?.password_reset === 'success'

  return (
    <div className="flex items-center justify-center min-h-full">
      <div className="max-w-md w-full space-y-8">
        <div>
          <Title as="h1" className="mt-6 text-center">
            Sign in to your account
          </Title>
          <UIText as="p" className="mt-2 text-center">
            Or{' '}
            <Link href="/signup" className="text-blue-600 hover:text-blue-500">
              create a new account
            </Link>
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

