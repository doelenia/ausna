'use client'

import { usePathname } from 'next/navigation'
import { IconButton, UIText } from '@/components/ui'
import { Search } from 'lucide-react'
import { useScrollDirection } from './ScrollDirectionContext'

export function MobileFeedTopBar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const scrollContext = useScrollDirection()
  const isFeedOrExplore = pathname === '/main' || pathname === '/explore'
  const topBarVisible = scrollContext?.topBarVisible ?? true

  if (!isFeedOrExplore) {
    return <>{children}</>
  }

  return (
    <>
      {/* Mobile only: top bar with Search on the right; hide on scroll down, show on scroll up; fading edge below */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none transition-transform duration-200 ease-out"
        style={{
          transform: topBarVisible ? 'translateY(0)' : 'translateY(-100%)',
        }}
      >
        <div className="w-full pointer-events-auto" style={{ maxWidth: 'var(--max-content-width)' }}>
          <div className="bg-gray-50 relative flex items-center justify-end h-16 px-4">
            <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
              <UIText>
                {pathname === '/main' ? 'Feeds' : 'Explore'}
              </UIText>
            </div>
            <IconButton icon={Search} href="/search" title="Search" aria-label="Search" />
          </div>
          {/* Fade into content (same idea as bottom nav: gradient from bar color to transparent) */}
          <div className="h-8 bg-gradient-to-b from-gray-50 to-transparent pointer-events-none" />
        </div>
      </div>
      <div className="pt-16 md:pt-0">{children}</div>
    </>
  )
}
