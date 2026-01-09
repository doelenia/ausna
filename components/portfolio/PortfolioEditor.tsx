'use client'

import { useState, useRef } from 'react'
import { Portfolio } from '@/types/portfolio'
import { createClient } from '@/lib/supabase/client'
import { createAvatarUploadHelpers } from '@/lib/storage/avatars-client'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { updatePortfolio } from '@/app/portfolio/[type]/[id]/actions'
import { EmojiPicker } from './EmojiPicker'
import { StickerAvatar } from './StickerAvatar'
import { ProjectTypeSelector } from './ProjectTypeSelector'
import { isProjectPortfolio, isCommunityPortfolio } from '@/types/portfolio'
import { Title, UIText, Button } from '@/components/ui'

interface PortfolioEditorProps {
  portfolio: Portfolio
  onCancel: () => void
  onSave: () => void
}

export function PortfolioEditor({ portfolio, onCancel, onSave }: PortfolioEditorProps) {
  const basic = getPortfolioBasic(portfolio)
  const metadata = portfolio.metadata as any
  const [name, setName] = useState(basic.name)
  const [description, setDescription] = useState(basic.description || '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(basic.avatar || null)
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(metadata?.basic?.emoji || null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [projectTypeGeneral, setProjectTypeGeneral] = useState<string>(metadata?.project_type_general || '')
  const [projectTypeSpecific, setProjectTypeSpecific] = useState<string>(metadata?.project_type_specific || '')
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
      setSelectedEmoji(null) // Clear emoji when image is selected
      setError(null)

      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleEmojiSelect = (emoji: string) => {
    setSelectedEmoji(emoji)
    setAvatarFile(null) // Clear image when emoji is selected
    setAvatarPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setError(null)
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
      
      // Verify ownership or manager status (for project/community portfolios)
      const isOwner = portfolio.user_id === user.id
      let isManager = false
      
      if (isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio)) {
        const portfolioMetadata = portfolio.metadata as any
        const managers = portfolioMetadata?.managers || []
        isManager = Array.isArray(managers) && managers.includes(user.id)
      }
      
      if (!isOwner && !isManager) {
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
      
      // Verify ownership or manager status one more time before submitting
      const isOwner = portfolio.user_id === currentUser.id
      let isManager = false
      
      if (isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio)) {
        const portfolioMetadata = portfolio.metadata as any
        const managers = portfolioMetadata?.managers || []
        isManager = Array.isArray(managers) && managers.includes(currentUser.id)
      }
      
      if (!isOwner && !isManager) {
        setError('You do not have permission to edit this portfolio')
        setLoading(false)
        return
      }

      // Ensure user is authenticated - use getUser() for security
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
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
      if (selectedEmoji) {
        formData.append('emoji', selectedEmoji)
      } else if (!avatarFile && !basic.avatar) {
        // If removing both image and emoji, send empty string to clear emoji
        formData.append('emoji', '')
      }
      if (projectTypeGeneral && projectTypeSpecific) {
        formData.append('project_type_general', projectTypeGeneral)
        formData.append('project_type_specific', projectTypeSpecific)
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
    <>
      {showEmojiPicker && (
        <EmojiPicker
          selectedEmoji={selectedEmoji}
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white shadow rounded-lg p-6">
            <Title as="h2" className="mb-6">Edit Portfolio</Title>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Avatar Upload or Emoji Selection */}
              <div>
                <UIText as="label" className="block mb-2">
                  Avatar
                </UIText>
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt="Avatar preview"
                        className="h-20 w-20 rounded-full object-cover border-2 border-gray-300"
                      />
                    ) : selectedEmoji ? (
                      <StickerAvatar
                        alt={name || 'Preview'}
                        type={portfolio.type}
                        size={80}
                        emoji={selectedEmoji}
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
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <UIText>{avatarPreview ? 'Change Image' : 'Upload Image'}</UIText>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowEmojiPicker(true)}
                      >
                        <UIText>{selectedEmoji ? 'Change Emoji' : 'Select Emoji'}</UIText>
                      </Button>
                    </div>
                    {(avatarFile || selectedEmoji || basic.avatar || metadata?.basic?.emoji) && (
                      <Button
                        type="button"
                        variant="text"
                        onClick={() => {
                          setAvatarFile(null)
                          setAvatarPreview(basic.avatar || null)
                          setSelectedEmoji(metadata?.basic?.emoji || null)
                          if (fileInputRef.current) {
                            fileInputRef.current.value = ''
                          }
                        }}
                        className="text-left px-0 py-1 text-red-600"
                      >
                        <UIText>Remove</UIText>
                      </Button>
                    )}
                  </div>
                </div>
              </div>

            {/* Name Input */}
            <div>
              <UIText as="label" htmlFor="name" className="block mb-2">
                Name <span className="text-red-500">*</span>
              </UIText>
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
              <UIText as="label" htmlFor="description" className="block mb-2">
                Description
              </UIText>
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

            {/* Project Type Selection (for projects and communities only) */}
            {(isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio)) && (
              <div>
                <ProjectTypeSelector
                  generalCategory={projectTypeGeneral}
                  specificType={projectTypeSpecific}
                  onSelect={(general, specific) => {
                    setProjectTypeGeneral(general)
                    setProjectTypeSpecific(specific)
                  }}
                  disabled={loading}
                />
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                <UIText>{error}</UIText>
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex gap-4">
              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={loading || !name.trim()}
              >
                <UIText>{loading ? 'Saving...' : 'Save Changes'}</UIText>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                disabled={loading}
              >
                <UIText>Cancel</UIText>
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
    </>
  )
}

