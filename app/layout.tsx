import type { Metadata } from 'next'
import './globals.css'
import { TopNav } from '@/components/main/TopNav'
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
            <div className="mx-auto h-full relative" style={{ maxWidth: 'var(--max-content-width)' }}>
              <div className="h-full overflow-auto w-full app-scroll">
                {/* Universal content padding so TopNav (top on desktop, bottom on mobile) never overlaps content */}
                <div className="pt-0 md:pt-2 pb-2 md:pb-0">
                  {children}
                </div>
              </div>
            <div className="hidden md:block absolute top-0 left-0 right-0 pointer-events-none">
              <div className="pointer-events-auto">
                <TopNav />
              </div>
              {/* Gradient overlay below nav on desktop */}
              <div className="h-8 bg-gradient-to-b from-gray-50 to-transparent pointer-events-none"></div>
            </div>
            <div className="block md:hidden absolute bottom-0 left-0 right-0 pointer-events-none">
              {/* Gradient overlay above nav on mobile */}
              <div className="h-8 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none"></div>
              <div className="pointer-events-auto">
                <TopNav />
              </div>
            </div>
            </div>
          </div>
        </DataCacheProvider>
      </body>
    </html>
  )
}

