import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import Link from 'next/link'
import { Title, UIText } from '@/components/ui'

export default function ResetPasswordPage() {
  return (
    <div className="flex items-center justify-center min-h-full">
      <div className="max-w-md w-full space-y-8">
        <div>
          <Title as="h1" className="mt-6 text-center">
            Set new password
          </Title>
          <UIText as="p" className="mt-2 text-center">
            Enter your new password below.
          </UIText>
        </div>
        <ResetPasswordForm />
        <div className="text-center">
          <Link href="/login" className="text-blue-600 hover:text-blue-500">
            <UIText>Back to sign in</UIText>
          </Link>
        </div>
      </div>
    </div>
  )
}

