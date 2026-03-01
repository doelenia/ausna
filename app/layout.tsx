import type { Metadata } from 'next'
import './globals.css'
import { TopNav } from '@/components/main/TopNav'
import { ContentColumnWithScroll } from '@/components/main/ContentColumnWithScroll'
import { InviteHandler } from '@/components/auth/InviteHandler'
import { DataCacheProvider } from '@/lib/cache/DataCacheContext'
import { createClient } from '@/lib/supabase/server'
import { getOnboardingStatus } from '@/lib/onboarding/status'
import { OnboardingGate } from '@/components/onboarding/OnboardingGate'

export const metadata: Metadata = {
  title: 'Ausna - Creative Community',
  description: 'A community for creators to mobilize their network for their creative projects.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let initialOnboardingStatus: Awaited<ReturnType<typeof getOnboardingStatus>> | null = null
  if (user) {
    try {
      initialOnboardingStatus = await getOnboardingStatus(user.id)
    } catch (e: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load onboarding status:', e)
      }
    }
  }

  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body className="light bg-white text-gray-900">
        <DataCacheProvider>
          <InviteHandler />
          {user && initialOnboardingStatus && (
            <OnboardingGate initialStatus={initialOnboardingStatus} />
          )}
          <div className="h-[100dvh] bg-gray-50">
            <div
              className="mx-auto h-full flex gap-0 md:gap-4"
              style={{ maxWidth: 'var(--max-content-width)' }}
            >
              {/* Desktop: left sidebar nav */}
              <aside className="hidden md:flex md:flex-col md:w-16 md:shrink-0 bg-gray-50">
                <TopNav variant="sidebar" />
              </aside>
              {/* Content area + mobile bottom nav */}
              <ContentColumnWithScroll>{children}</ContentColumnWithScroll>
            </div>
          </div>
        </DataCacheProvider>
      </body>
    </html>
  )
}

