'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Button, Title, Content, UIText } from '@/components/ui'

interface InviteContactDialogProps {
  isOpen: boolean
  onClose: () => void
  ownerUserId: string
  initialEmail?: string
  initialName?: string
  onSuccess?: (message: string) => void
}

function isValidEmail(email: string): boolean {
  const trimmed = email.trim()
  if (!trimmed) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

export function InviteContactDialog({
  isOpen,
  onClose,
  ownerUserId,
  initialEmail,
  initialName,
  onSuccess,
}: InviteContactDialogProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')

  const [emailError, setEmailError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [inviteAlreadyPending, setInviteAlreadyPending] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setEmail('')
      setName('')
      setEmailError(null)
      setNameError(null)
      setSubmitError(null)
      setSuccessMessage(null)
      setInviteAlreadyPending(false)
      setIsSubmitting(false)
      return
    }

    if (typeof initialEmail === 'string' && initialEmail.trim()) {
      setEmail(initialEmail.trim())
    }
    if (typeof initialName === 'string' && initialName.trim()) {
      setName(initialName.trim())
    }
  }, [isOpen, initialEmail, initialName])

  if (!isOpen) return null

  const trimmedEmail = email.trim()
  const trimmedName = name.trim()
  const emailValid = isValidEmail(trimmedEmail)
  const nameValid = trimmedName.length > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    setSuccessMessage(null)

    if (!emailValid) {
      setEmailError('Please enter a valid email address.')
      return
    }
    if (!nameValid) {
      setNameError('Name is required.')
      return
    }

    setEmailError(null)
    setNameError(null)

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/contacts/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          name: trimmedName,
          fromUserId: ownerUserId,
          ...(inviteAlreadyPending ? { forceResend: true } : {}),
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        if (response.status === 409 && data?.code === 'invite_already_pending') {
          setInviteAlreadyPending(true)
          return
        }
        setSubmitError(data?.error || 'Failed to send invitation.')
        return
      }

      const message = inviteAlreadyPending
        ? `Invitation email resent to ${trimmedEmail}.`
        : `Invitation email sent to ${trimmedEmail}.`

      setSuccessMessage(message)
      setInviteAlreadyPending(false)
      onSuccess?.(message)
    } catch (err) {
      console.error('Error sending invite from InviteContactDialog:', err)
      setSubmitError('Failed to send invitation. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const primaryLabel = inviteAlreadyPending ? 'Resend invite email' : 'Send invite email'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
        <div className="flex justify-between items-start mb-4">
          <Title as="h2">Invite to Ausna</Title>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <Content className="mb-4">
          Confirm the email and add a name, then we’ll send the invitation email.
        </Content>

        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <UIText className="text-green-700 text-sm">{successMessage}</UIText>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <UIText as="label" htmlFor="invite-contact-email" className="block mb-1">
              Email
            </UIText>
            <input
              id="invite-contact-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError(null)
                if (inviteAlreadyPending) setInviteAlreadyPending(false)
              }}
              placeholder="name@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              disabled={isSubmitting || !!successMessage}
            />
            {emailError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                <UIText className="text-red-700 text-sm">{emailError}</UIText>
              </div>
            )}
          </div>

          <div>
            <UIText as="label" htmlFor="invite-contact-name" className="block mb-1">
              Name
            </UIText>
            <input
              id="invite-contact-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError(null)
              }}
              placeholder="Name for your contact"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              disabled={isSubmitting || !!successMessage}
            />
            {nameError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                <UIText className="text-red-700 text-sm">{nameError}</UIText>
              </div>
            )}
          </div>

          {inviteAlreadyPending && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
              <UIText className="text-gray-700 text-sm">
                You already invited this email. You can resend the invitation email.
              </UIText>
            </div>
          )}

          {submitError && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-md">
              <UIText className="text-red-700 text-sm">{submitError}</UIText>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="text" type="button" onClick={onClose} disabled={isSubmitting}>
              <UIText>{successMessage ? 'Close' : 'Cancel'}</UIText>
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSubmitting || !!successMessage || !emailValid || !nameValid}
            >
              <UIText>{isSubmitting ? 'Processing...' : primaryLabel}</UIText>
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

