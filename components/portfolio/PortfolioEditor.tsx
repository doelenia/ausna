'use client'

import { useState, useRef } from 'react'
import { Portfolio } from '@/types/portfolio'
import { createClient } from '@/lib/supabase/client'
import { createAvatarUploadHelpers } from '@/lib/storage/avatars-client'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { updatePortfolio } from '@/app/portfolio/[type]/[id]/actions'

interface PortfolioEditorProps {
  portfolio: Portfolio
  onCancel: () => void
  onSave: () => void
}

export function PortfolioEditor({ portfolio, onCancel, onSave }: PortfolioEditorProps) {
  const basic = getPortfolioBasic(portfolio)
  const [name, setName] = useState(basic.name)
  const [description, setDescription] = useState(basic.description || '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(basic.avatar || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const avatarHelpers = createAvatarUploadHelpers(supabase)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file')
        return
      }
      
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be less than 5MB')
        return
      }

      setAvatarFile(file)
      setError(null)

      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    // Verify authentication before submitting
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      
      if (authError || !user) {
        setError('You must be signed in to edit portfolios. Please sign in and try again.')
        setLoading(false)
        // Redirect to login after a short delay
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
        return
      }
      
      // Verify ownership
      if (portfolio.user_id !== user.id) {
        setError('You do not have permission to edit this portfolio')
        setLoading(false)
        return
      }
    } catch (authCheckError) {
      setError('Failed to verify authentication. Please try again.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // CRITICAL: Ensure we have a valid session before submitting
      // getUser() automatically refreshes expired tokens
      const { data: { user: currentUser }, error: currentUserError } = await supabase.auth.getUser()
      if (currentUserError || !currentUser) {
        setError('Your session has expired. Please sign in again.')
        setLoading(false)
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
        return
      }
      
      // Verify ownership one more time before submitting
      if (portfolio.user_id !== currentUser.id) {
        setError('You do not have permission to edit this portfolio')
        setLoading(false)
        return
      }

      // Ensure session is fresh - refresh if needed
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('No active session. Please sign in again.')
        setLoading(false)
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
        return
      }

      const formData = new FormData()
      formData.append('portfolioId', portfolio.id)
      formData.append('name', name.trim())
      formData.append('description', description.trim())
      if (avatarFile) {
        formData.append('avatar', avatarFile)
      }

      const result = await updatePortfolio(formData)

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      onSave()
    } catch (err: any) {
      // Check if it's a redirect error
      if (err && typeof err === 'object' && 'digest' in err && err.digest?.startsWith('NEXT_REDIRECT')) {
        // Let Next.js handle the redirect
        throw err
      }
      setError(err.message || 'Failed to update portfolio')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-6">Edit Portfolio</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Avatar
              </label>
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar preview"
                      className="h-20 w-20 rounded-full object-cover border-2 border-gray-300"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-full bg-gray-200 flex items-center justify-center border-2 border-gray-300">
                      <svg
                        className="h-8 w-8 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {avatarPreview ? 'Change Avatar' : 'Upload Avatar'}
                  </button>
                  {avatarFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarFile(null)
                        setAvatarPreview(basic.avatar || null)
                        if (fileInputRef.current) {
                          fileInputRef.current.value = ''
                        }
                      }}
                      className="ml-2 px-4 py-2 text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Name Input */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>

            {/* Description Input */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={1000}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                {error}
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

