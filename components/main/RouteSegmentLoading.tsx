'use client'

import { Skeleton, SkeletonCard, SkeletonAvatar, SkeletonText } from '@/components/ui/Skeleton'
import { MessagesInboxSkeleton } from '@/components/main/MessagesInboxSkeleton'

type Variant = 'feed' | 'explore' | 'spaces' | 'messages' | 'conversation' | 'portfolio' | 'members'

export function RouteSegmentLoading({ variant = 'feed' }: { variant?: Variant }) {
  if (variant === 'messages') {
    return <MessagesInboxSkeleton />
  }

  if (variant === 'conversation') {
    return (
      <div className="flex flex-col h-[50vh] max-w-2xl mx-auto px-4 py-4">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200">
          <SkeletonAvatar size={40} />
          <SkeletonText lines={1} width="35%" lineHeight={18} />
        </div>
        <div className="flex-1 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-xl p-3 bg-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-200'}`}>
                <SkeletonText lines={i % 3 === 0 ? 2 : 1} width="100%" lineHeight={14} gap={4} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'portfolio') {
    // Mirrors PortfolioView header stack: avatar → name (+ pill) → description → badges → actions → open calls → tabs.
    return (
      <div className="px-4 md:px-10 py-6">
        <div className="bg-transparent rounded-lg p-6">
          <div className="mb-6 mt-12">
            <div className="mb-4 flex justify-start">
              <Skeleton width={96} height={96} rounded="full" />
            </div>

            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <SkeletonText lines={1} width="55%" lineHeight={28} />
              <Skeleton height={22} width={72} className="rounded-full flex-shrink-0" />
            </div>

            <div className="mb-4 w-full max-w-2xl space-y-2">
              <SkeletonText lines={1} width="100%" lineHeight={16} />
              <SkeletonText lines={1} width="100%" lineHeight={16} />
              <SkeletonText lines={1} width="72%" lineHeight={16} />
            </div>

            <div className="mb-4 flex flex-wrap gap-2 max-w-xl">
              <Skeleton height={26} width={112} className="rounded-full" />
              <Skeleton height={26} width={96} className="rounded-full" />
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
              <Skeleton height={36} width={92} className="rounded-lg" />
              <Skeleton height={36} width={88} className="rounded-lg" />
              <Skeleton height={36} width={104} className="rounded-lg" />
            </div>

            <div className="mb-6">
              <div className="flex gap-3 overflow-hidden pb-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-[min(220px,72vw)] rounded-xl border border-gray-200 bg-white p-3 space-y-2 shadow-sm"
                  >
                    <Skeleton height={14} width="55%" />
                    <SkeletonText lines={2} width="100%" lineHeight={13} gap={6} />
                    <Skeleton height={28} width={72} className="rounded-md mt-1" />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="rounded-xl bg-gray-50/80 backdrop-blur-xl p-1 flex gap-2 overflow-x-auto">
                <Skeleton height={36} width={88} className="rounded-lg flex-shrink-0" />
                <Skeleton height={36} width={64} className="rounded-lg flex-shrink-0" />
                <Skeleton height={36} width={72} className="rounded-lg flex-shrink-0" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <SkeletonCard />
          <SkeletonCard showAvatar={false} />
        </div>
      </div>
    )
  }

  if (variant === 'members') {
    return (
      <div className="px-4 py-6 space-y-4 max-w-3xl mx-auto">
        <SkeletonText lines={1} width="30%" lineHeight={22} />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white">
              <SkeletonAvatar size={40} />
              <SkeletonText lines={1} width="50%" lineHeight={16} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'explore') {
    return (
      <div className="px-4 py-6 space-y-4">
        <SkeletonText lines={1} width="35%" lineHeight={22} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} showBanner />
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'spaces') {
    return (
      <div className="px-4 py-6 space-y-4">
        <SkeletonText lines={1} width="28%" lineHeight={24} />
        <Skeleton height={40} width="100%" className="rounded-md max-w-xl" />
        <div className="flex gap-2">
          <Skeleton height={32} width={64} className="rounded-lg" />
          <Skeleton height={32} width={88} className="rounded-lg" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex w-[100px] flex-col items-center gap-2">
              <Skeleton width={80} height={80} rounded="full" />
              <Skeleton height={10} width={72} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // feed (default) — match FeedView story row + feed list skeletons (avoid large→compact layout shift)
  return (
    <div className="md:px-10 py-4 space-y-4">
      <div className="mt-3 mb-1 flex items-start gap-2 overflow-x-auto px-3 py-1 md:px-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex w-[100px] flex-shrink-0 flex-col items-center">
            <div className="flex w-full flex-col items-center gap-1.5 px-1 py-1.5">
              <Skeleton width={80} height={80} rounded="full" className="flex-shrink-0" />
              <Skeleton height={12} width={48} className="rounded" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 mb-4 flex items-center gap-2 px-3 md:px-0">
        <Skeleton width={20} height={20} className="rounded" />
        <Skeleton height={14} width={72} className="rounded" />
      </div>
      <div className="space-y-4 px-3 md:px-0">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
