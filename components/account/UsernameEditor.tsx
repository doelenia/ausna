'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createHumanPortfolioHelpers } from '@/lib/portfolio/human-client'

interface UsernameEditorProps {
  initialUsername: string
  userId: string
}

export function UsernameEditor({ initialUsername, userId }: UsernameEditorProps) {
  const [username, setUsername] = useState(initialUsername)
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()
  const portfolioHelpers = createHumanPortfolioHelpers(supabase)

  const handleSave = async () => {
    if (!username || username === initialUsername) {
      setIsEditing(false)
      return
    }

    // Validate username
    const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/
    if (!usernameRegex.test(username)) {
      setError('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // Check if username is already taken in human portfolios
      const { data: existingPortfolios, error: checkError } = await supabase
        .from('portfolios')
        .select('user_id, metadata')
        .eq('type', 'human')
        .neq('user_id', userId)

      if (checkError) throw checkError

      // Check if any existing portfolio has this username
      const usernameTaken = existingPortfolios?.some(portfolio => {
        const metadata = portfolio.metadata as any
        return metadata?.username?.toLowerCase() === username.toLowerCase()
      })

      if (usernameTaken) {
        setError('Username is already taken. Please choose another.')
        setLoading(false)
        return
      }

      // Update username in human portfolio
      await portfolioHelpers.updateHumanPortfolioUsername(userId, username.toLowerCase())

      setSuccess(true)
      setIsEditing(false)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to update username')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setUsername(initialUsername)
    setIsEditing(false)
    setError(null)
  }

  if (isEditing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={username}
            onChange={(e) => {
              const value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
              setUsername(value)
              setError(null)
            }}
            minLength={3}
            maxLength={30}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-50"
            placeholder="username"
            disabled={loading}
          />
          <button
            onClick={handleSave}
            disabled={loading || username === initialUsername}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        {success && (
          <p className="text-sm text-green-600">Username updated successfully!</p>
        )}
        <p className="text-xs text-gray-500">
          3-30 characters, letters, numbers, underscores, and hyphens only
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-900 font-medium">@{username}</span>
      <button
        onClick={() => setIsEditing(true)}
        className="text-sm text-blue-600 hover:text-blue-500"
      >
        Edit
      </button>
    </div>
  )
}

