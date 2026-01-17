import type { Metadata } from 'next'
import './globals.css'
import { TopNav } from '@/components/main/TopNav'
import { InviteHandler } from '@/components/auth/InviteHandler'
import { DataCacheProvider } from '@/lib/cache/DataCacheContext'

export const metadata: Metadata = {
  title: 'Ausna - Creative Community',
  description: 'A community for creators to mobilize their network for their creative projects.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body className="light bg-white text-gray-900">
        <DataCacheProvider>
          <InviteHandler />
          <div className="h-[100dvh] bg-gray-50">
            <div className="mx-auto h-full relative" style={{ maxWidth: 'var(--max-content-width)' }}>
              <div className="h-full overflow-auto w-full">
                <div className="hidden md:block">
                  <div className="h-16"></div>
                </div>
                {children}
                <div className="block md:hidden">
                  <div className="h-16"></div>
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

