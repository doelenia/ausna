'use client'

import { Skeleton, SkeletonCard, SkeletonAvatar, SkeletonText } from '@/components/ui/Skeleton'

type Variant = 'feed' | 'explore' | 'messages' | 'conversation' | 'portfolio' | 'members'

export function RouteSegmentLoading({ variant = 'feed' }: { variant?: Variant }) {
  if (variant === 'messages') {
    return (
      <div className="px-4 py-6 max-w-2xl mx-auto space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-100">
            <SkeletonAvatar size={48} />
            <div className="flex-1 min-w-0 space-y-2">
              <SkeletonText lines={1} width="45%" lineHeight={16} />
              <SkeletonText lines={1} width="75%" lineHeight={14} />
            </div>
          </div>
        ))}
      </div>
    )
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
    return (
      <div className="px-4 md:px-10 py-6 space-y-6">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <SkeletonAvatar size={96} />
          <div className="flex-1 space-y-3 w-full">
            <SkeletonText lines={1} width="40%" lineHeight={24} />
            <SkeletonText lines={2} width="100%" lineHeight={16} gap={6} />
            <div className="flex gap-2 pt-2">
              <Skeleton height={36} width={96} className="rounded-lg" />
              <Skeleton height={36} width={96} className="rounded-lg" />
              <Skeleton height={36} width={96} className="rounded-lg" />
            </div>
          </div>
        </div>
        <SkeletonCard />
        <SkeletonCard />
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

  // feed (default)
  return (
    <div className="md:px-10 py-4 space-y-4">
      <div className="flex items-start gap-4 overflow-hidden px-3 md:px-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center flex-shrink-0 w-48">
            <div className="w-full rounded-2xl px-3 pt-3 pb-4">
              <div className="flex flex-col items-center gap-3">
                <Skeleton width={96} height={96} rounded="full" />
                <SkeletonText lines={1} width="70%" lineHeight={14} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-4 px-3 md:px-0">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
