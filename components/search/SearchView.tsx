'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SearchResultItem } from './SearchResultItem'
import { UIText, Content } from '@/components/ui'
import { Search } from 'lucide-react'

interface SearchResult {
  id: string
  type: 'human' | 'projects' | 'community'
  name: string
  description?: string
  avatar?: string | null
  emoji?: string | null
  username?: string | null
  projectType?: string | null
  user_id: string
  created_at: string
  is_approved?: boolean
}

export function SearchView() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const supabase = createClient()

  // Get current user (use getSession to avoid refresh token errors)
  useEffect(() => {
    const getUser = async () => {
      try {
        // Use getUser() for security - it authenticates with the server
        const {
          data: { user },
        } = await supabase.auth.getUser()
        setCurrentUserId(user?.id || null)
      } catch (error) {
        // Silently handle auth errors (user is not logged in or session is invalid)
        setCurrentUserId(null)
      }
    }
    getUser()
  }, [supabase])

  // Debounced search function
  const performSearch = useCallback(async (searchQuery: string) => {
    setLoading(true)
    try {
      const url = searchQuery
        ? `/api/portfolios/search?q=${encodeURIComponent(searchQuery)}`
        : '/api/portfolios/search'
      
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Search failed')
      }
      
      const data = await response.json()
      setResults(data.results || [])
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query)
    }, 300) // 300ms debounce

    return () => clearTimeout(timer)
  }, [query, performSearch])

  // Load initial results on mount
  useEffect(() => {
    performSearch('')
  }, [performSearch])

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
      {/* Search Input - Sticky */}
      <div className="sticky top-0 z-10 bg-gray-50 pt-4 pb-4 px-4 -mx-4 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search portfolios, users, projects, communities..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            autoFocus
          />
        </div>
      </div>

      {/* Results Container - Scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-6" style={{ minHeight: 0 }}>
        {/* Results */}
        {loading && results.length === 0 ? (
          <div className="text-center py-12">
            <UIText className="text-gray-500">Searching...</UIText>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12">
            <UIText className="text-gray-500">
              {query ? 'No results found' : 'Start typing to search...'}
            </UIText>
          </div>
        ) : (
          <div className="space-y-1">
            {results.map((result) => (
              <SearchResultItem
                key={result.id}
                result={result}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

