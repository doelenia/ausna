'use client'

import { Title } from '@/components/ui'
import { Skeleton, SkeletonAvatar, SkeletonText } from '@/components/ui/Skeleton'

/**
 * Matches loaded Messages layout: title, tab chips, conversation rows (avatar + name/time + preview).
 */
export function MessagesInboxSkeleton() {
  return (
    <div className="bg-transparent p-6 h-full flex flex-col">
      <Title as="h1" className="mb-6">
        Messages
      </Title>

      <div className="flex gap-2 mb-6">
        <Skeleton height={40} width={108} className="rounded-lg" />
        <Skeleton height={40} width={124} className="rounded-lg" />
      </div>

      <div className="space-y-2 flex-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="w-full flex items-center gap-4 p-4 rounded-lg bg-gray-50/80"
          >
            <SkeletonAvatar size={48} />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <SkeletonText lines={1} width="42%" lineHeight={18} />
                <Skeleton width={52} height={14} className="rounded flex-shrink-0" />
              </div>
              <SkeletonText lines={1} width="78%" lineHeight={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
