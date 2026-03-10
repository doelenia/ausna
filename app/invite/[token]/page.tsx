'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Title, Content, UIText } from '@/components/ui'
import { buildLoginHref } from '@/lib/auth/login-redirect'

function isValidEmail(email: string): boolean {
  const trimmed = email.trim()
  if (!trimmed) return false
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

export default function InviteAcceptPage() {
  const router = useRouter()
  const params = useParams()
  const token = typeof params?.token === 'string' ? params.token : ''
  const loginHref =
    typeof window === 'undefined'
      ? '/login'
      : buildLoginHref({
          returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        })

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setLoadError('Invalid invite link.')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`/api/invite/${token}`)
        if (!response.ok) {
          const data = await response.json().catch(() => null)
          setLoadError(
            data?.error || 'This invite link is invalid or has expired.'
          )
          setLoading(false)
          return
        }
        const data = await response.json()
        setEmail(data.email || '')
        setName(data.name || '')
        setLoading(false)
      } catch (err) {
        console.error('Error loading invite:', err)
        setLoadError('Failed to load invite. Please try again later.')
        setLoading(false)
      }
    }

    load()
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEmailError(null)
    setPasswordError(null)
    setSubmitError(null)

    const trimmedEmail = email.trim()
    if (!isValidEmail(trimmedEmail)) {
      setEmailError('Please enter a valid email address.')
    }

    if (!password || password.length < 8) {
      setPasswordError('Password must be at least 8 characters long.')
    }

    if (!isValidEmail(trimmedEmail) || !password || password.length < 8) {
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/invite/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          name: name.trim(),
          password,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setSubmitError(
          data?.error || 'Failed to complete invite. Please try again.'
        )
        setIsSubmitting(false)
        return
      }

      // On success, the API will have created a session; send user to main
      router.push('/main')
    } catch (err) {
      console.error('Error completing invite:', err)
      setSubmitError('Failed to complete invite. Please try again.')
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <Content>Loading invitation…</Content>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <Title as="h1" className="mb-3">
          Invite problem
        </Title>
        <Content className="mb-4">{loadError}</Content>
        <Button variant="primary" asLink href={loginHref}>
          <UIText>Go to login</UIText>
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <Title as="h1" className="mb-4">
        Join Ausna
      </Title>
      <Content className="mb-4">
        Set your email and password to finish joining Ausna. You will be logged in right away and connected with the person who invited you.
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
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
        </div>
        <div>
          <UIText as="label" htmlFor="invite-password" className="block mb-1">
            Password
          </UIText>
          <input
            id="invite-password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (passwordError) setPasswordError(null)
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="At least 8 characters"
          />
          {passwordError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
              <UIText className="text-red-700 text-sm">{passwordError}</UIText>
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
            onClick={() => router.push(loginHref)}
            disabled={isSubmitting}
          >
            <UIText>Cancel</UIText>
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            <UIText>{isSubmitting ? 'Joining…' : 'Join Ausna'}</UIText>
          </Button>
        </div>
      </form>
    </div>
  )
}

