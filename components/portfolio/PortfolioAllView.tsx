'use client'

import { useState, useEffect } from 'react'
import { Portfolio } from '@/types/portfolio'
import { SubPortfoliosTab } from './SubPortfoliosTab'
import { NotesTab } from '@/components/notes/NotesTab'
import { isHumanPortfolio } from '@/types/portfolio'
import { Title, Content, UIText, Button } from '@/components/ui'

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
            <Title as="h1" className="mb-2">{basic.name}</Title>
          </div>

          {/* Tabs - Only show if human portfolio */}
          {showPortfoliosTab && (
            <div className="mb-6">
              <nav className="flex gap-2">
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    activeTab === 'notes'
                      ? 'bg-gray-200 text-gray-700'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <UIText>Notes</UIText>
                </button>
                <button
                  onClick={() => setActiveTab('portfolios')}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    activeTab === 'portfolios'
                      ? 'bg-gray-200 text-gray-700'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <UIText>{tabLabel}</UIText>
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

