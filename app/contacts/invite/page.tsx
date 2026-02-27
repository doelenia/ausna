'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Title, Content, UIText } from '@/components/ui'

export const dynamic = 'force-dynamic'

function isValidEmail(email: string): boolean {
  const trimmed = email.trim()
  if (!trimmed) return false
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

export default function InviteContactPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [fromUserId, setFromUserId] = useState<string | undefined>(undefined)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const params = new URLSearchParams(window.location.search)
      const initialEmail = params.get('email') || ''
      const initialFromUserId = params.get('fromUserId') || undefined
      if (initialEmail) {
        setEmail(initialEmail)
      }
      if (initialFromUserId) {
        setFromUserId(initialFromUserId)
      }
    } catch {
      // ignore parsing errors
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEmailError(null)
    setNameError(null)
    setSubmitError(null)

    const trimmedEmail = email.trim()
    const trimmedName = name.trim()

    if (!isValidEmail(trimmedEmail)) {
      setEmailError('Please enter a valid email address.')
    }

    if (!trimmedName) {
      setNameError('Please enter a name.')
    }

    if (!isValidEmail(trimmedEmail) || !trimmedName) {
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        email: trimmedEmail,
        name: trimmedName,
        fromUserId,
      }

      const sendInvite = async (forceResend: boolean) => {
        const response = await fetch('/api/contacts/invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            forceResend ? { ...payload, forceResend: true } : payload
          ),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => null)

          if (
            response.status === 409 &&
            data?.code === 'invite_already_pending'
          ) {
            const confirmResend = window.confirm(
              'You have already invited this email. Resend the invite email?'
            )
            if (confirmResend) {
              return await sendInvite(true)
            }
            throw new Error('Invite already pending and resend was cancelled.')
          }

          throw new Error(data?.error || 'Failed to send invitation. Please try again.')
        }

        return await response.json().catch(() => ({}))
      }

      await sendInvite(false)

      router.push('/main')
    } catch (err) {
      console.error('Error sending contact invite:', err)
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Failed to send invitation. Please try again.'
      )
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <Title as="h1" className="mb-4">
        Invite to Ausna
      </Title>
      <Content className="mb-4">
        Confirm the email and name for the person you want to invite. We will send them an invitation to join Ausna and connect with you.
      </Content>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <UIText as="label" htmlFor="invite-email" className="block mb-1">
            Email
          </UIText>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (emailError) setEmailError(null)
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="name@example.com"
          />
          {emailError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
              <UIText className="text-red-700 text-sm">{emailError}</UIText>
            </div>
          )}
        </div>
        <div>
          <UIText as="label" htmlFor="invite-name" className="block mb-1">
            Name
          </UIText>
          <input
            id="invite-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (nameError) setNameError(null)
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="How should we refer to them?"
          />
          {nameError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
              <UIText className="text-red-700 text-sm">{nameError}</UIText>
            </div>
          )}
        </div>
        {submitError && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
            <UIText className="text-red-700 text-sm">{submitError}</UIText>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="text"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            <UIText>Cancel</UIText>
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            <UIText>{isSubmitting ? 'Sending...' : 'Send invitation'}</UIText>
          </Button>
        </div>
      </form>
    </div>
  )
}

