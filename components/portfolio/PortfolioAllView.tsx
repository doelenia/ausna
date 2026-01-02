'use client'

import { useState, useEffect } from 'react'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import Link from 'next/link'
import { SubPortfoliosTab } from './SubPortfoliosTab'
import { NotesTab } from '@/components/notes/NotesTab'
import { isHumanPortfolio } from '@/types/portfolio'

interface PortfolioAllViewProps {
  portfolio: Portfolio
  basic: {
    name: string
    description?: string
    avatar?: string
  }
  isOwner: boolean
  currentUserId?: string
  tabLabel: string
  canCreateNote: boolean
}

export function PortfolioAllView({
  portfolio,
  basic,
  isOwner,
  currentUserId,
  tabLabel,
  canCreateNote,
}: PortfolioAllViewProps) {
  const [activeTab, setActiveTab] = useState<'notes' | 'portfolios'>('notes')
  const showPortfoliosTab = isHumanPortfolio(portfolio)

  return (
    <div className="bg-transparent rounded-lg p-6">
          {/* Header */}
          <div className="mb-6">
            <Link
              href={getPortfolioUrl(portfolio.type, portfolio.id)}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-4 inline-block"
            >
              ← Back to Portfolio
            </Link>
            <h1 className="text-3xl font-bold mb-2">{basic.name}</h1>
          </div>

          {/* Tabs - Only show if human portfolio */}
          {showPortfoliosTab && (
            <div className="border-b border-gray-200 mb-6">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'notes'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Notes
                </button>
                <button
                  onClick={() => setActiveTab('portfolios')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'portfolios'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tabLabel}
                </button>
              </nav>
            </div>
          )}

          {/* Tab Content */}
          <div>
            {!showPortfoliosTab || activeTab === 'notes' ? (
              <NotesTab
                portfolioId={portfolio.id}
                currentUserId={currentUserId}
                canCreateNote={canCreateNote}
              />
            ) : (
              <SubPortfoliosTab
                portfolioId={portfolio.id}
                portfolioType={portfolio.type}
                hideTitles={true}
              />
            )}
          </div>
        </div>
  )
}

