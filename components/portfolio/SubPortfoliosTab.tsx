'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getSubPortfolios } from '@/app/portfolio/[type]/[id]/actions'

interface SubPortfolio {
  id: string
  type: 'projects' | 'community'
  name: string
  avatar?: string
  slug: string
  role?: 'manager' | 'member' // Role of the current user in this portfolio
}

interface SubPortfoliosTabProps {
  portfolioId: string
  portfolioType: 'human' | 'projects' | 'community'
  showOnly?: 'projects' | 'communities' // Optional filter to show only one type
  hideTitles?: boolean // Hide section titles (for All page)
}

export function SubPortfoliosTab({
  portfolioId,
  portfolioType,
  showOnly,
  hideTitles = false,
}: SubPortfoliosTabProps) {
  const [projects, setProjects] = useState<SubPortfolio[]>([])
  const [communities, setCommunities] = useState<SubPortfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSubPortfolios = async () => {
      setLoading(true)
      setError(null)
      
      const result = await getSubPortfolios(portfolioId)
      
      if (result.error || !result.success) {
        setError(result.error || 'Failed to load sub-portfolios')
        setLoading(false)
        return
      }

      setProjects(result.projects || [])
      setCommunities(result.communities || [])
      setLoading(false)
    }

    fetchSubPortfolios()
  }, [portfolioId])

  if (loading) {
    return (
      <div className="py-8 text-center text-gray-500">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center text-red-500">
        {error}
      </div>
    )
  }

  // Filter based on showOnly prop
  const showProjects = !showOnly || showOnly === 'projects'
  const showCommunities = !showOnly || showOnly === 'communities'

  return (
    <div className="space-y-8">
      {/* Communities - Horizontal Scroll (Top 10) */}
      {showCommunities && communities.length > 0 && (
        <div className="overflow-x-auto pb-4 -mx-6 px-6" style={{ scrollbarWidth: 'thin' }}>
          <div className="flex gap-4 min-w-max">
            {communities.slice(0, 10).map((community) => (
              <Link
                key={community.id}
                href={getPortfolioUrl('community', community.id)}
                className="flex-shrink-0 w-64 bg-transparent rounded-lg border border-gray-200 transition-opacity hover:opacity-80 overflow-hidden"
              >
                {community.avatar ? (
                  <img
                    src={community.avatar}
                    alt={community.name}
                    className="w-full h-32 object-cover"
                  />
                ) : (
                  <div className="w-full h-32 bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
                    <svg
                      className="h-12 w-12 text-white opacity-50"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {community.name}
                    </h3>
                    {community.role && (
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${
                        community.role === 'manager'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {community.role === 'manager' ? 'Manager' : 'Member'}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Projects - Vertical Scroll */}
      {showProjects && projects.length > 0 && (
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={getPortfolioUrl('projects', project.id)}
              className="block bg-transparent rounded-lg border border-gray-200 transition-opacity hover:opacity-80 overflow-hidden"
            >
              <div className="flex gap-4">
                {project.avatar ? (
                  <img
                    src={project.avatar}
                    alt={project.name}
                    className="w-24 h-24 object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0">
                    <svg
                      className="h-8 w-8 text-white opacity-50"
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
                <div className="flex-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-gray-900">
                      {project.name}
                    </h3>
                    {project.role && (
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${
                        project.role === 'manager'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {project.role === 'manager' ? 'Manager' : 'Member'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Empty State */}
      {((showProjects && projects.length === 0) || (showCommunities && communities.length === 0)) &&
        (showOnly
          ? (showOnly === 'projects' && projects.length === 0) ||
            (showOnly === 'communities' && communities.length === 0)
          : projects.length === 0 && communities.length === 0) && (
          <div className="py-12 text-center text-gray-500">
            {showOnly === 'projects'
              ? 'No projects found'
              : showOnly === 'communities'
              ? 'No communities found'
              : portfolioType === 'human'
              ? 'No involvement found'
              : 'No navigations found'}
          </div>
        )}
    </div>
  )
}

