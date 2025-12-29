'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === 'signup') {
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

        if (error) throw error

        if (data.user) {
          // Check if email confirmation is required
          if (data.user.email_confirmed_at) {
            // Email already confirmed (e.g., OAuth), redirect to main
            router.push('/main')
          } else {
            // Email confirmation required
            setEmailSent(true)
          }
        }
      } else {
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

  // Show email confirmation message after signup
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">Check your email</h3>
          <p className="text-sm text-gray-600 mb-4">
            We've sent a confirmation email to <strong>{email}</strong>. Please click the link in the
            email to verify your account.
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Didn't receive the email? Check your spam folder or{' '}
            <button
              type="button"
              onClick={() => {
                setEmailSent(false)
                setEmail('')
                setPassword('')
                setUsername('')
              }}
              className="text-blue-600 hover:text-blue-500 underline"
            >
              try again
            </button>
          </p>
          <Link
            href="/login"
            className="text-sm text-blue-600 hover:text-blue-500"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="your@email.com"
          />
        </div>

        {mode === 'signup' && (
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Username <span className="text-gray-500">(optional)</span>
            </label>
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
            <p className="mt-1 text-xs text-gray-500">
              3-30 characters, letters, numbers, underscores, and hyphens only
            </p>
          </div>
        )}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
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

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
        </button>
      </form>
    </div>
  )
}

