'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from './actions'
import { UsernameEditor } from '@/components/account/UsernameEditor'
import { HumanPortfolio } from '@/types/portfolio'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'

interface ClientAccountPageProps {
  userId: string
  initialHumanPortfolio: HumanPortfolio | null
}

export function ClientAccountPage({ userId, initialHumanPortfolio }: ClientAccountPageProps) {
  const [user, setUser] = useState<any>(null)
  const [humanPortfolio, setHumanPortfolio] = useState<HumanPortfolio | null>(initialHumanPortfolio)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()
  const portfolioHelpers = createHumanPortfolioHelpers(supabase)

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      if (user.id !== userId) {
        router.push('/main')
        return
      }

      setUser(user)

      // Load human portfolio if not provided
      if (!humanPortfolio) {
        try {
          const portfolio = await portfolioHelpers.ensureHumanPortfolio(user.id)
          setHumanPortfolio(portfolio)
        } catch (error) {
          console.error('Error loading human portfolio:', error)
        }
      }

      setLoading(false)
    }

    checkAuth()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.push('/login')
      } else {
        setUser(session.user)
      }
    })

    return () => subscription.unsubscribe()
  }, [userId, supabase, router, humanPortfolio, portfolioHelpers])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white shadow rounded-lg p-6">
            <p className="text-center text-gray-500">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
            <Link
              href="/main"
              className="text-blue-600 hover:text-blue-500 text-sm font-medium"
            >
              Back to Main
            </Link>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Profile Information</h2>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">User ID</dt>
                  <dd className="mt-1 text-sm text-gray-900">{user.id}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="mt-1 text-sm text-gray-900">{user.email || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email Verified</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {user.email_confirmed_at ? 'Yes' : 'No'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Account Created</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {user.created_at
                      ? new Date(user.created_at).toLocaleDateString()
                      : 'Unknown'}
                  </dd>
                </div>
              </dl>
            </div>

            {humanPortfolio && (
              <div>
                <h2 className="text-lg font-medium text-gray-900 mb-4">Human Portfolio</h2>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-gray-500 mb-2">Username</dt>
                    <dd className="mt-1">
                      <UsernameEditor 
                        initialUsername={humanPortfolio.metadata.username || ''} 
                        userId={user.id} 
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {(humanPortfolio.metadata as any)?.basic?.name || 'Not set'}
                    </dd>
                  </div>
                  {(humanPortfolio.metadata as any)?.basic?.description && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Description</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {(humanPortfolio.metadata as any)?.basic?.description}
                      </dd>
                    </div>
                  )}
                  {(humanPortfolio.metadata as any)?.basic?.avatar && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Avatar</dt>
                      <dd className="mt-1">
                        <img
                          src={(humanPortfolio.metadata as any)?.basic?.avatar}
                          alt="Avatar"
                          className="h-12 w-12 rounded-full"
                        />
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Portfolio Slug</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      <Link 
                        href={`/portfolio/human/${humanPortfolio.id}`}
                        className="text-blue-600 hover:text-blue-500"
                      >
                        /portfolio/human/{humanPortfolio.slug}
                      </Link>
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            <div className="pt-6 border-t border-gray-200">
              <form action={signOut}>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

