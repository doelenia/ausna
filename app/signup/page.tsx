import { AuthForm } from '@/components/auth/AuthForm'
import Link from 'next/link'
import { Title, UIText } from '@/components/ui'

export default function SignupPage() {
  return (
    <div className="flex items-center justify-center min-h-full">
      <div className="max-w-md w-full space-y-8">
        <div>
          <Title as="h1" className="mt-6 text-center">
            Welcome to join Ausna!
          </Title>
          <UIText as="p" className="mt-2 text-center">
            Or{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-500">
              sign in to your existing account
            </Link>
          </UIText>
        </div>
        <AuthForm mode="signup" />
      </div>
    </div>
  )
}

