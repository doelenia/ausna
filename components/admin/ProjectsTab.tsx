'use client'

import { useState, useEffect } from 'react'
import { searchPortfolios, deletePortfolio } from '@/app/admin/actions'
import Link from 'next/link'

function IdCell({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="group relative flex items-center gap-2">
      <span className="text-sm text-gray-600 font-mono truncate max-w-[120px]">{id}</span>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
        title="Copy ID"
      >
        {copied ? '✓' : '📋'}
      </button>
    </div>
  )
}

interface Portfolio {
  id: string
  type: string
  name: string
  description: string | null
  user_id: string
  creator_name: string | null
  created_at: string
  members_count: number
}

export function ProjectsTab() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)

  const loadPortfolios = async (currentPage: number = 1) => {
    setLoading(true)
    setError(null)
    try {
      const result = await searchPortfolios('projects', searchQuery, currentPage, 10)
      if (result.success) {
        setPortfolios(result.portfolios || [])
        setTotal(result.total || 0)
        setTotalPages(result.totalPages || 0)
        setPage(currentPage)
      } else {
        setError(result.error || 'Failed to search projects')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    setPage(1)
    await loadPortfolios(1)
  }

  useEffect(() => {
    // Load all projects on mount
    loadPortfolios(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (portfolioId: string) => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return
    }

    setActionLoading(portfolioId)
    try {
      const result = await deletePortfolio(portfolioId)
      if (result.success) {
        // Reload current page after deletion
        await loadPortfolios(page)
      } else {
        setError(result.error || 'Failed to delete project')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search by creator name, project name, or ID..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
        <button
          onClick={() => {
            setSearchQuery('')
            setPage(1)
            loadPortfolios(1)
          }}
          className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
        >
          Clear
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Projects {total > 0 && `(${total} total)`}
        </h2>
        {loading ? (
          <div className="text-gray-500">Loading projects...</div>
        ) : portfolios.length === 0 ? (
          <div className="text-gray-500">
            {searchQuery ? 'No projects found. Try a different search term.' : 'No projects found.'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto mb-6">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Creator
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Members
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {portfolios.map((portfolio) => (
                    <tr key={portfolio.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <IdCell id={portfolio.id} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {portfolio.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {portfolio.description || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {portfolio.creator_name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {portfolio.members_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(portfolio.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                        <Link
                          href={`/portfolio/projects/${portfolio.id}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleDelete(portfolio.id)}
                          disabled={actionLoading === portfolio.id}
                          className="text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          {actionLoading === portfolio.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                <div className="text-sm text-gray-700">
                  Page {page} of {totalPages} ({total} total)
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadPortfolios(page - 1)}
                    disabled={page <= 1 || loading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => loadPortfolios(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

