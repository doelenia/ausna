'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createAvatarUploadHelpers } from '@/lib/storage/avatars-client'
import { generateSlug } from '@/lib/portfolio/utils'
import { PortfolioType } from '@/types/portfolio'
import { createPortfolio } from '@/app/portfolio/create/[type]/actions'

interface CreatePortfolioFormProps {
  type: 'projects' | 'discussion'
  fromPortfolioId?: string
}

export function CreatePortfolioForm({ type, fromPortfolioId }: CreatePortfolioFormProps) {
  const [name, setName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const avatarHelpers = createAvatarUploadHelpers(supabase)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file')
        return
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be less than 5MB')
        return
      }

      setAvatarFile(file)
      setError(null)

      // Create preview
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

    setLoading(true)
    setError(null)

    try {
      // Create portfolio via server action
      // Avatar will be uploaded after portfolio creation in the server action
      const formData = new FormData()
      formData.append('type', type)
      formData.append('name', name.trim())
      if (fromPortfolioId) {
        formData.append('fromPortfolioId', fromPortfolioId)
      }
      if (avatarFile) {
        formData.append('avatar', avatarFile)
      }

      const result = await createPortfolio(formData)

      if (result.error || !result.success) {
        setError(result.error || 'Failed to create portfolio')
        setLoading(false)
        return
      }

      if (!result.portfolioId) {
        setError('Portfolio created but no ID returned')
        setLoading(false)
        return
      }

      // Redirect to the new portfolio
      // Use window.location for a full page navigation to ensure fresh data
      const redirectUrl = `/portfolio/${type}/${result.portfolioId}`
      if (process.env.NODE_ENV === 'development') {
        console.log('Redirecting to:', redirectUrl, { type, portfolioId: result.portfolioId })
      }
      window.location.href = redirectUrl
    } catch (err: any) {
      setError(err.message || 'Failed to create portfolio')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Avatar Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Avatar (Optional)
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
                  setAvatarPreview(null)
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
          placeholder={`Enter ${type === 'projects' ? 'project' : 'discussion'} name`}
          disabled={loading}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {loading ? 'Creating...' : 'Create Portfolio'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

