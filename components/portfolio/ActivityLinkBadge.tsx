'use client'

import { Card, UIText } from '@/components/ui'
import { ExternalLink } from 'lucide-react'

interface ActivityLinkBadgeProps {
  url: string
}

function getHostname(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url.length > 40 ? `${url.slice(0, 37)}...` : url
  }
}

export function ActivityLinkBadge({ url }: ActivityLinkBadgeProps) {
  const hostname = getHostname(url)
  const displayText = hostname.length > 30 ? `${hostname.slice(0, 27)}...` : hostname

  const handleClick = () => {
    const href = url.startsWith('http') ? url : `https://${url}`
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-block text-left focus:outline-none"
    >
      <Card variant="subtle" padding="none">
        <div className="flex items-center gap-2 max-w-full px-2 py-2">
          <div className="w-10 h-10 rounded-lg border flex flex-col items-center justify-center flex-shrink-0 border-gray-200 bg-white">
            <ExternalLink className="w-5 h-5 text-gray-700" />
          </div>
          <div className="min-w-0 pr-6">
            <UIText as="div" className="whitespace-normal break-words">
              {displayText}
            </UIText>
          </div>
        </div>
      </Card>
    </button>
  )
}
