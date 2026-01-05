import { AuthForm } from '@/components/auth/AuthForm'
import Link from 'next/link'
import { Title, Content, UIText } from '@/components/ui'

export default function LoginPage() {
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
        <AuthForm mode="login" />
      </div>
    </div>
  )
}

