'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Title, Content, UIText } from '@/components/ui'

interface AuthFormProps {
  mode: 'login' | 'signup'
}

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [waitlistSuccess, setWaitlistSuccess] = useState(false)
  const [emailChecked, setEmailChecked] = useState(false)
  const [isApproved, setIsApproved] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Step 1: Check email against waitlist
  const handleEmailCheck = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    setError(null)

    try {
      // Check waitlist
      const { data: waitlistEntry, error: waitlistError } = await supabase
        .from('waitlist')
        .select('status, id')
        .eq('email', email.toLowerCase())
        .single()

      // If no waitlist entry exists, create one as pending
      if (waitlistError && waitlistError.code === 'PGRST116') {
        // No entry found, create pending entry
        const { error: insertError } = await supabase
          .from('waitlist')
          .insert({
            email: email.toLowerCase(),
            username: null, // Username will be set later
            status: 'pending',
          })

        if (insertError) {
          console.error('Error creating waitlist entry:', insertError)
          // Check if error is due to unique constraint (email already exists)
          if (insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
            // Email already exists in waitlist, check its status
            const { data: existingEntry } = await supabase
              .from('waitlist')
              .select('status')
              .eq('email', email.toLowerCase())
              .single()
            
            if (existingEntry) {
              if (existingEntry.status === 'approved') {
                // Approved - allow signup to continue
                setEmailChecked(true)
                setIsApproved(true)
                setLoading(false)
                return
              } else if (existingEntry.status === 'pending') {
                setError('Your email is on the waitlist but has not been approved yet. Please wait for approval.')
                setLoading(false)
                return
              }
            }
          }
          setError('Failed to add to waitlist. Please try again.')
          setLoading(false)
          return
        }

        // Show success message with green checkmark
        setWaitlistSuccess(true)
        setLoading(false)
        return
      }

      // If waitlist entry exists, check status
      if (waitlistEntry) {
        if (waitlistEntry.status === 'approved') {
          // Approved - allow signup to continue
          setEmailChecked(true)
          setIsApproved(true)
          setLoading(false)
          return
        } else if (waitlistEntry.status === 'pending') {
          setError('Your email is on the waitlist but has not been approved yet. Please wait for approval.')
          setLoading(false)
          return
        } else if (waitlistEntry.status === 'rejected') {
          // If rejected, delete the old entry to allow them to try again
          const { error: deleteError } = await supabase
            .from('waitlist')
            .delete()
            .eq('id', waitlistEntry.id)

          if (deleteError) {
            console.error('Error deleting rejected entry:', deleteError)
          }

          // Create new pending entry
          const { error: insertError } = await supabase
            .from('waitlist')
            .insert({
              email: email.toLowerCase(),
              username: null,
              status: 'pending',
            })

          if (insertError) {
            console.error('Error creating new waitlist entry:', insertError)
            setError('Error creating new waitlist entry. Please try again.')
            setLoading(false)
            return
          }

          // Show success message for new request
          setWaitlistSuccess(true)
          setLoading(false)
          return
        } else {
          setError('Your email is on the waitlist but has not been approved yet.')
          setLoading(false)
          return
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  // Step 2: Complete signup (only for approved users)
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {

      // Validate username if provided
      if (username) {
        const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/
        if (!usernameRegex.test(username)) {
          setError(
            'Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens'
          )
          setLoading(false)
          return
        }

        // Check if username is already taken in human portfolios
        const { data: existingPortfolios, error: checkError } = await supabase
          .from('portfolios')
          .select('metadata')
          .eq('type', 'human')

        if (checkError) {
          console.error('Error checking username:', checkError)
        } else if (existingPortfolios) {
          // Check if any portfolio has this username in metadata
          const usernameTaken = existingPortfolios.some(portfolio => {
            const metadata = portfolio.metadata as any
            return metadata?.username?.toLowerCase() === username.toLowerCase()
          })

          if (usernameTaken) {
            setError('Username is already taken. Please choose another.')
            setLoading(false)
            return
          }
        }
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            username: username.toLowerCase() || undefined,
          },
        },
      })

      if (error) {
        console.error('Signup error:', error)
        throw error
      }

      if (data.user) {
        console.log('User created:', data.user.id, 'Email confirmed:', data.user.email_confirmed_at)
        // Check if email confirmation is required
        if (data.user.email_confirmed_at) {
          // Email already confirmed (e.g., OAuth), redirect to main
          router.push('/main')
        } else {
          // Email confirmation required
          console.log('Email confirmation required, showing email sent message')
          setEmailSent(true)
        }
      } else {
        console.error('No user returned from signup')
        setError('Failed to create account. Please try again.')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === 'signup') {
        // If email not checked yet, check it first
        if (!emailChecked) {
          await handleEmailCheck(e)
          return
        }
        // If approved, proceed with signup
        if (isApproved) {
          await handleSignup(e)
          return
        }
      } else {
        // Login flow
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        if (data.user && data.session) {
          // Session is automatically set in cookies by Supabase client
          // Use window.location.href for full page reload to ensure cookies are set
          // This is critical for server actions to work properly
          window.location.href = '/main'
        } else {
          setError('Failed to establish session. Please try again.')
          setLoading(false)
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Show waitlist success message
  if (mode === 'signup' && waitlistSuccess) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <Title as="h3" className="mb-2">You're on the waitlist!</Title>
          <UIText className="mb-4">
            Your email <strong>{email}</strong> has been added to the waitlist. You will be notified when your account is approved.
          </UIText>
          <Link
            href="/login"
            className="text-blue-600 hover:text-blue-500"
          >
            <UIText>Back to Sign In</UIText>
          </Link>
        </div>
      </div>
    )
  }

  // Show email confirmation message after signup (for approved users)
  if (mode === 'signup' && emailSent) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <Title as="h3" className="mb-2">Check your email</Title>
          <UIText className="mb-4">
            We've sent a confirmation email to <strong>{email}</strong>. Please click the link in the
            email to verify your account.
          </UIText>
          <UIText as="p" className="mb-4 text-xs text-gray-500">
            Didn't receive the email? Check your spam folder or{' '}
            <Button
              variant="text"
              type="button"
              onClick={() => {
                setEmailSent(false)
                setEmail('')
                setPassword('')
                setUsername('')
              }}
              className="underline"
            >
              <UIText>try again</UIText>
            </Button>
          </UIText>
          <Link
            href="/login"
            className="text-blue-600 hover:text-blue-500"
          >
            <UIText>Back to Sign In</UIText>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <UIText as="label" htmlFor="email" className="block mb-1">
            Email
          </UIText>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              // Reset email check if email changes
              if (emailChecked) {
                setEmailChecked(false)
                setIsApproved(false)
              }
            }}
            required
            disabled={emailChecked && isApproved}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
            placeholder="your@email.com"
          />
        </div>

        {/* Show password and username only if email is checked and approved */}
        {mode === 'signup' && emailChecked && isApproved && (
          <>
            <div>
              <UIText as="label" htmlFor="username" className="block mb-1">
                Username <span className="text-gray-500">(optional)</span>
              </UIText>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => {
                  const value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
                  setUsername(value)
                }}
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_-]{3,30}"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                placeholder="username"
              />
              <UIText as="p" className="mt-1">
                3-30 characters, letters, numbers, underscores, and hyphens only
              </UIText>
            </div>

            <div>
              <UIText as="label" htmlFor="password" className="block mb-1">
                Password
              </UIText>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                placeholder="••••••••"
              />
            </div>
          </>
        )}

        {/* Show password for login */}
        {mode === 'login' && (
          <div>
            <UIText as="label" htmlFor="password" className="block mb-1">
              Password
            </UIText>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="••••••••"
            />
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={loading}
        >
          <UIText>
          {loading
            ? 'Loading...'
            : mode === 'login'
            ? 'Sign In'
            : emailChecked && isApproved
            ? 'Sign Up'
            : 'Check Email'}
          </UIText>
        </Button>

        {mode === 'signup' && emailChecked && isApproved && (
          <Button
            type="button"
            variant="text"
            fullWidth
            onClick={() => {
              setEmailChecked(false)
              setIsApproved(false)
              setPassword('')
              setUsername('')
            }}
          >
            <UIText>Use different email</UIText>
          </Button>
        )}
      </form>
    </div>
  )
}

