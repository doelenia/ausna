'use client'

import Link from 'next/link'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/utils'

interface PortfolioInvitationCardProps {
  portfolio: Portfolio
  isSent?: boolean
}

export function PortfolioInvitationCard({ portfolio, isSent = false }: PortfolioInvitationCardProps) {
  const basic = getPortfolioBasic(portfolio)
  const avatarUrl = basic.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(basic.name)}&background=random`

  return (
    <Link
      href={getPortfolioUrl(portfolio.type, portfolio.id)}
      className={`block mb-2 rounded-lg border-2 overflow-hidden transition-all ${
        isSent 
          ? 'border-blue-400 bg-transparent' 
          : 'border-gray-300 bg-transparent'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex">
        {/* Avatar */}
        <div className="flex-shrink-0 w-20 h-20">
          {basic.avatar ? (
            <img
              src={basic.avatar}
              alt={basic.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${
              isSent ? 'bg-blue-200' : 'bg-gray-200'
            }`}>
              <svg
                className={`h-10 w-10 ${isSent ? 'text-blue-600' : 'text-gray-400'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold uppercase ${
                  isSent ? 'text-blue-600' : 'text-gray-600'
                }`}>
                  {portfolio.type === 'projects' ? 'Project' : 'Community'}
                </span>
              </div>
              <h3 className={`font-semibold truncate ${
                isSent ? 'text-blue-900' : 'text-gray-900'
              }`}>
                {basic.name}
              </h3>
              {basic.description && (
                <p className={`text-xs mt-1 line-clamp-2 ${
                  isSent ? 'text-blue-700' : 'text-gray-600'
                }`}>
                  {basic.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

