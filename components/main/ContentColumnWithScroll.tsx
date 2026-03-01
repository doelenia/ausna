'use client'

import { TopNav } from '@/components/main/TopNav'
import { MobileFeedTopBar } from '@/components/main/MobileFeedTopBar'
import { ScrollDirectionProvider } from './ScrollDirectionContext'

export function ContentColumnWithScroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollDirectionProvider>
      {(scrollProps) => (
        <div className="flex-1 min-w-0 flex flex-col h-full relative md:pl-0">
          <div
            ref={scrollProps.ref}
            onScroll={scrollProps.onScroll}
            className="h-full overflow-auto w-full app-scroll flex-1"
          >
            <div className="pt-0 pb-2 md:pb-0 md:pt-2">
              <MobileFeedTopBar>{children}</MobileFeedTopBar>
            </div>
          </div>
          <div className="block md:hidden absolute bottom-0 left-0 right-0 pointer-events-none">
            <div className="h-8 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />
            <div className="pointer-events-auto">
              <TopNav variant="bottom" />
            </div>
          </div>
        </div>
      )}
    </ScrollDirectionProvider>
  )
}
