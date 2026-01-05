'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from './actions'
import { UsernameEditor } from '@/components/account/UsernameEditor'
import { HumanPortfolio } from '@/types/portfolio'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'
import { InterestTags } from '@/components/portfolio/InterestTags'
import { Topic } from '@/types/indexing'
import { Title, UIText, Button } from '@/components/ui'

interface ClientAccountPageProps {
  userId: string
  initialHumanPortfolio: HumanPortfolio | null
}

export function ClientAccountPage({ userId, initialHumanPortfolio }: ClientAccountPageProps) {
  const [user, setUser] = useState<any>(null)
  const [humanPortfolio, setHumanPortfolio] = useState<HumanPortfolio | null>(initialHumanPortfolio)
  const [topInterests, setTopInterests] = useState<Array<{ topic: Topic; memory_score: number; aggregate_score: number }>>([])
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

      // Fetch top 5 interested topics
      try {
        const { getTopInterestedTopics } = await import('@/lib/indexing/interest-tracking')
        const interests = await getTopInterestedTopics(user.id, 5, supabase)
        setTopInterests(interests)
      } catch (error) {
        console.error('Error loading top interests:', error)
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
      <div className="bg-white shadow rounded-lg p-6">
        <UIText as="p" className="text-center">Loading...</UIText>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <Title as="h1">Account Settings</Title>
            <Link
              href="/main"
              className="text-blue-600 hover:text-blue-500"
            >
              <UIText>Back to Main</UIText>
            </Link>
          </div>

          <div className="space-y-6">
            <div>
              <UIText as="h2" className="mb-4">Profile Information</UIText>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <UIText as="dt" className="text-gray-500">User ID</UIText>
                  <UIText as="dd" className="mt-1">{user.id}</UIText>
                </div>
                <div>
                  <UIText as="dt" className="text-gray-500">Email</UIText>
                  <UIText as="dd" className="mt-1">{user.email || 'Not set'}</UIText>
                </div>
                <div>
                  <UIText as="dt" className="text-gray-500">Email Verified</UIText>
                  <UIText as="dd" className="mt-1">
                    {user.email_confirmed_at ? 'Yes' : 'No'}
                  </UIText>
                </div>
                <div>
                  <UIText as="dt" className="text-gray-500">Account Created</UIText>
                  <UIText as="dd" className="mt-1">
                    {user.created_at
                      ? new Date(user.created_at).toLocaleDateString()
                      : 'Unknown'}
                  </UIText>
                </div>
              </dl>
            </div>

            {humanPortfolio && (
              <div>
                <UIText as="h2" className="mb-4">Human Portfolio</UIText>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <UIText as="dt" className="mb-2">Username</UIText>
                    <dd className="mt-1">
                      <UsernameEditor 
                        initialUsername={humanPortfolio.metadata.username || ''} 
                        userId={user.id} 
                      />
                    </dd>
                  </div>
                  <div>
                    <UIText as="dt">Name</UIText>
                    <UIText as="dd" className="mt-1">
                      {(humanPortfolio.metadata as any)?.basic?.name || 'Not set'}
                    </UIText>
                  </div>
                  {(humanPortfolio.metadata as any)?.basic?.description && (
                    <div className="sm:col-span-2">
                      <UIText as="dt">Description</UIText>
                      <dd className="mt-1">
                        <UIText>{(humanPortfolio.metadata as any)?.basic?.description}</UIText>
                        {topInterests.length > 0 && (
                          <InterestTags topics={topInterests} />
                        )}
                      </dd>
                    </div>
                  )}
                  {!((humanPortfolio.metadata as any)?.basic?.description) && topInterests.length > 0 && (
                    <div className="sm:col-span-2">
                      <UIText as="dt">Interests</UIText>
                      <dd className="mt-1">
                        <InterestTags topics={topInterests} />
                      </dd>
                    </div>
                  )}
                  {(humanPortfolio.metadata as any)?.basic?.avatar && (
                    <div>
                      <UIText as="dt">Avatar</UIText>
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
                    <UIText as="dt">Portfolio Slug</UIText>
                    <dd className="mt-1">
                      <Link 
                        href={`/portfolio/human/${humanPortfolio.id}`}
                        className="text-blue-600 hover:text-blue-500"
                      >
                        <UIText>/portfolio/human/{humanPortfolio.slug}</UIText>
                      </Link>
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            <div className="pt-6 border-t border-gray-200">
              <form action={signOut}>
                <Button
                  type="submit"
                  variant="danger"
                >
                  <UIText>Sign Out</UIText>
                </Button>
              </form>
            </div>
          </div>
        </div>
  )
}

