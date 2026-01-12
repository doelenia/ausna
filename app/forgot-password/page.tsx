import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import Link from 'next/link'
import { Title, UIText } from '@/components/ui'

export default function ForgotPasswordPage() {
  return (
    <div className="flex items-center justify-center min-h-full">
      <div className="max-w-md w-full space-y-8">
        <div>
          <Title as="h1" className="mt-6 text-center">
            Reset your password
          </Title>
          <UIText as="p" className="mt-2 text-center">
            Enter your email address and we'll send you a link to reset your password.
          </UIText>
        </div>
        <ForgotPasswordForm />
        <div className="text-center">
          <Link href="/login" className="text-blue-600 hover:text-blue-500">
            <UIText>Back to sign in</UIText>
          </Link>
        </div>
      </div>
    </div>
  )
}

