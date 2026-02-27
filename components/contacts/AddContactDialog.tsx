'use client'

import { useState, useEffect } from 'react'
import { Button, Title, Content, UIText, UserAvatar } from '@/components/ui'
import { InviteContactDialog } from '@/components/contacts/InviteContactDialog'

interface FoundUser {
  id: string
  name: string | null
  username: string | null
  avatar: string | null
  isFriend: boolean
  hasPendingRequest: boolean
}

interface AddContactDialogProps {
  isOpen: boolean
  onClose: () => void
  ownerUserId: string
}

function isValidEmail(email: string): boolean {
  const trimmed = email.trim()
  if (!trimmed) return false
  // Simple but robust-enough email format check
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

export function AddContactDialog({
  isOpen,
  onClose,
  ownerUserId,
}: AddContactDialogProps) {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const trimmedEmail = email.trim()
  const isEmailValid = isValidEmail(trimmedEmail)

  useEffect(() => {
    if (!isOpen) {
      setEmail('')
      setEmailError(null)
      setIsSearching(false)
      setFoundUser(null)
      setActionError(null)
      setIsSubmitting(false)
      setSuccessMessage(null)
      setShowInviteDialog(false)
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  // Automatically search as user types a valid email (debounced)
  useEffect(() => {
    if (successMessage) return
    setActionError(null)

    const trimmed = email.trim()
    if (!trimmed) {
      setFoundUser(null)
      setIsSearching(false)
      return
    }

    if (!isValidEmail(trimmed)) {
      setFoundUser(null)
      setIsSearching(false)
      return
    }

    let cancelled = false
    setIsSearching(true)

    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/contacts/find-user-by-email?email=${encodeURIComponent(trimmed)}`
        )
        if (!response.ok) {
          if (response.status === 404) {
            if (!cancelled) {
              setFoundUser(null)
            }
          } else {
            const data = await response.json().catch(() => null)
            if (!cancelled) {
              setActionError(data?.error || 'Failed to look up user.')
              setFoundUser(null)
            }
          }
          return
        }

        const data = await response.json()
        if (!cancelled) {
          if (data && data.user) {
            const u = data.user as FoundUser
            setFoundUser(u)
          } else {
            setFoundUser(null)
          }
        }
      } catch (err) {
        console.error('Error searching user by email:', err)
        if (!cancelled) {
          setActionError('Failed to look up user. Please try again.')
          setFoundUser(null)
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false)
        }
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [email])

  const handlePrimaryAction = async () => {
    const trimmed = email.trim()
    if (!isValidEmail(trimmed)) {
      setEmailError('Please enter a valid email address.')
      return
    }

    setEmailError(null)
    setActionError(null)

    // Path 1: existing registered user → send friend request
    if (foundUser) {
      if (foundUser.isFriend) {
        setActionError('You are already friends on Ausna.')
        return
      }
      if (foundUser.hasPendingRequest) {
        setActionError('A friend request is already pending.')
        return
      }

      setIsSubmitting(true)
      try {
        const response = await fetch(`/api/friends/${foundUser.id}`, {
          method: 'POST',
        })
        if (!response.ok) {
          const data = await response.json().catch(() => null)
          setActionError(data?.error || 'Failed to send friend request.')
          return
        }
        const displayName = foundUser.name || foundUser.username || 'this user'
        setSuccessMessage(`Friend request sent to ${displayName}.`)
      } catch (err) {
        console.error('Error sending friend request from AddContactDialog:', err)
        setActionError('Failed to send friend request. Please try again.')
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    // Path 2: invite to Ausna → step 2 popup (name + confirm email)
    setShowInviteDialog(true)
  }

  const primaryLabel = foundUser ? 'Send friend request' : 'Invite to Ausna'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
        <div className="flex justify-between items-start mb-4">
          <Title as="h2">Add contact</Title>
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
          Enter an email to connect with someone on Ausna or invite them to join.
        </Content>

        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <UIText className="text-green-700 text-sm">{successMessage}</UIText>
          </div>
        )}

        <div className="space-y-2 mb-4">
          <div>
            <UIText as="label" htmlFor="add-contact-email" className="block mb-1">
              Email
            </UIText>
            <input
              id="add-contact-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError(null)
              }}
              placeholder="name@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
            {emailError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                <UIText className="text-red-700 text-sm">{emailError}</UIText>
              </div>
            )}
            {isSearching && !emailError && (
              <div className="mt-1">
                <UIText className="text-gray-500 text-sm">Searching for existing Ausna users…</UIText>
              </div>
            )}
          </div>
        </div>

        {/* Search result & selection */}
        <div className="space-y-3 mb-4">
          {foundUser ? (
            <button
              type="button"
              className="w-full text-left p-3 bg-gray-50 border border-gray-200 rounded-md flex items-center gap-3 hover:bg-gray-100 transition-colors"
            >
              <UserAvatar
                userId={foundUser.id}
                name={foundUser.name || foundUser.username}
                avatar={foundUser.avatar || undefined}
                size={40}
                showLink={false}
              />
              <div className="flex-1 min-w-0">
                <UIText as="div">
                  {foundUser.name || foundUser.username || 'Ausna user'}
                </UIText>
                {foundUser.username && (
                  <UIText as="div" className="text-gray-600 text-sm truncate">
                    @{foundUser.username}
                  </UIText>
                )}
                {foundUser.isFriend && (
                  <UIText className="text-gray-600 text-xs mt-1">
                    Already in your contacts
                  </UIText>
                )}
                {!foundUser.isFriend && foundUser.hasPendingRequest && (
                  <UIText className="text-gray-600 text-xs mt-1">
                    Friend request already pending
                  </UIText>
                )}
              </div>
            </button>
          ) : (
            email &&
            !isSearching && (
              <UIText className="text-gray-600 text-sm">
                No existing Ausna account found for this email. You can invite them to Ausna.
              </UIText>
            )
          )}
        </div>

        {actionError && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-md">
            <UIText className="text-red-700 text-sm">{actionError}</UIText>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="text"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            <UIText>{successMessage ? 'Close' : 'Cancel'}</UIText>
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handlePrimaryAction}
            disabled={
              isSubmitting ||
              !!successMessage ||
              (foundUser ? false : !isEmailValid)
            }
          >
            <UIText>{isSubmitting ? 'Processing...' : primaryLabel}</UIText>
          </Button>
        </div>
      </div>

      <InviteContactDialog
        isOpen={showInviteDialog}
        onClose={() => setShowInviteDialog(false)}
        ownerUserId={ownerUserId}
        initialEmail={trimmedEmail}
        onSuccess={(message) => {
          setSuccessMessage(message)
        }}
      />
    </div>
  )
}

