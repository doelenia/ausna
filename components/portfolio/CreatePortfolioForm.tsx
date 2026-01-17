'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createAvatarUploadHelpers } from '@/lib/storage/avatars-client'
import { generateSlug } from '@/lib/portfolio/utils'
import { PortfolioType } from '@/types/portfolio'
import { createPortfolio } from '@/app/portfolio/create/[type]/actions'
import { EmojiPicker } from './EmojiPicker'
import { StickerAvatar } from './StickerAvatar'
import { ProjectTypeSelector } from './ProjectTypeSelector'
import { CommunityTypeSelector } from './CommunityTypeSelector'
import { UIText, Button } from '@/components/ui'

interface CreatePortfolioFormProps {
  type: 'projects' | 'community'
}

export function CreatePortfolioForm({ type }: CreatePortfolioFormProps) {
  const [name, setName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [projectTypeGeneral, setProjectTypeGeneral] = useState<string>('')
  const [projectTypeSpecific, setProjectTypeSpecific] = useState<string>('')
  const [creatorRole, setCreatorRole] = useState<string>('Creator')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const avatarHelpers = createAvatarUploadHelpers(supabase)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.heic') && !file.name.toLowerCase().endsWith('.heif')) {
        setError('Please select an image file')
        return
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be less than 5MB')
        return
      }

      setError(null)

      try {
        // Convert HEIC to JPEG if needed
        const { ensureBrowserCompatibleImage } = await import('@/lib/utils/heic-converter')
        const compatibleFile = await ensureBrowserCompatibleImage(file)
        
        setAvatarFile(compatibleFile)
        setSelectedEmoji(null) // Clear emoji when image is selected

        // Create preview
        const reader = new FileReader()
        reader.onloadend = () => {
          setAvatarPreview(reader.result as string)
        }
        reader.readAsDataURL(compatibleFile)
      } catch (error: any) {
        console.error('Error processing image:', error)
        setError(error.message || 'Failed to process image. Please try a different image.')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
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

    // Require either image or emoji
    if (!avatarFile && !selectedEmoji) {
      setError('Please upload an image or select an emoji')
      return
    }

    // Require type
    if (!projectTypeGeneral || !projectTypeSpecific) {
      setError(`Please select a ${type === 'projects' ? 'project' : 'community'} type`)
      return
    }

    // Validate creator role (max 2 words)
    if (creatorRole.trim()) {
      const words = creatorRole.trim().split(/\s+/)
      if (words.length > 2) {
        setError('Creator role must be 2 words or less')
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      // Create portfolio via server action
      // Avatar will be uploaded after portfolio creation in the server action
      const formData = new FormData()
      formData.append('type', type)
      formData.append('name', name.trim())
      if (avatarFile) {
        formData.append('avatar', avatarFile)
      }
      if (selectedEmoji) {
        formData.append('emoji', selectedEmoji)
      }
      formData.append('project_type_general', projectTypeGeneral)
      formData.append('project_type_specific', projectTypeSpecific)
      formData.append('creator_role', creatorRole.trim() || 'Creator')

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
    <>
      {showEmojiPicker && (
        <EmojiPicker
          selectedEmoji={selectedEmoji}
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Avatar Upload or Emoji Selection */}
        <div>
          <UIText as="label" className="block mb-2">
            Avatar <span className="text-red-500">*</span>
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
                  type={type}
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
                  accept="image/*,image/heic,image/heif,.heic,.heif"
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
              {(avatarFile || selectedEmoji) && (
                <Button
                  type="button"
                  variant="text"
                  onClick={() => {
                    setAvatarFile(null)
                    setAvatarPreview(null)
                    setSelectedEmoji(null)
                    if (fileInputRef.current) {
                      fileInputRef.current.value = ''
                    }
                  }}
                  className="text-left px-0 py-1 text-red-600"
                >
                  <UIText>Remove</UIText>
                </Button>
              )}
              <UIText as="p" className="text-xs text-gray-500">
                Please upload an image or select an emoji
              </UIText>
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
          placeholder={`Enter ${type === 'projects' ? 'project' : 'community'} name`}
          disabled={loading}
        />
      </div>

      {/* Type Selection */}
      <div>
        {type === 'projects' ? (
          <ProjectTypeSelector
            generalCategory={projectTypeGeneral}
            specificType={projectTypeSpecific}
            onSelect={(general, specific) => {
              setProjectTypeGeneral(general)
              setProjectTypeSpecific(specific)
            }}
            disabled={loading}
          />
        ) : (
          <CommunityTypeSelector
            generalCategory={projectTypeGeneral}
            specificType={projectTypeSpecific}
            onSelect={(general, specific) => {
              setProjectTypeGeneral(general)
              setProjectTypeSpecific(specific)
            }}
            disabled={loading}
          />
        )}
      </div>

      {/* Creator Role Input */}
      <div>
        <UIText as="label" htmlFor="creator_role" className="block mb-2">
          Your Role <span className="text-gray-500">(optional, defaults to "Creator")</span>
        </UIText>
        <input
          type="text"
          id="creator_role"
          value={creatorRole}
          onChange={(e) => setCreatorRole(e.target.value)}
          maxLength={50}
          placeholder="Creator"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={loading}
        />
        <UIText as="p" className="text-xs text-gray-500 mt-1">
          Your role in this {type === 'projects' ? 'project' : 'community'} (max 2 words)
        </UIText>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          <UIText>{error}</UIText>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex gap-4">
        <Button
          type="submit"
          variant="primary"
          fullWidth
          disabled={loading || !name.trim() || (!avatarFile && !selectedEmoji) || !projectTypeGeneral || !projectTypeSpecific}
        >
          <UIText>{loading ? 'Creating...' : 'Create Portfolio'}</UIText>
        </Button>
      </div>
    </form>
    </>
  )
}

