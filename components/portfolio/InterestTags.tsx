'use client'

import { Topic } from '@/types/indexing'

interface InterestTagsProps {
  topics: Array<{ topic: Topic; memory_score: number; aggregate_score: number }>
}

export function InterestTags({ topics }: InterestTagsProps) {
  if (!topics || topics.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {topics.map(({ topic }) => (
        <span
          key={topic.id}
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
        >
          {topic.name}
        </span>
      ))}
    </div>
  )
}




