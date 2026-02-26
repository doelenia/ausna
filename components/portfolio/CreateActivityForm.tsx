'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createAvatarUploadHelpers } from '@/lib/storage/avatars-client'
import { createPortfolio } from '@/app/portfolio/create/[type]/actions'
import { ProjectTypeSelector } from './ProjectTypeSelector'
import { UIText, Button, Card, Content, UIButtonText } from '@/components/ui'
import { EmojiPicker } from './EmojiPicker'
import { StickerAvatar } from './StickerAvatar'
import { ActivityDateTimePicker } from './ActivityDateTimePicker'
import { ActivityDateTimeBadge } from './ActivityDateTimeBadge'
import { ActivityLocationPicker } from './ActivityLocationPicker'
import { ActivityLocationBadge } from './ActivityLocationBadge'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import type { ActivityLocationValue } from '@/lib/location'

interface HostProjectOption {
  id: string
  name: string
  avatar?: string
  emoji?: string
  description?: string
  projectType?: string | null
}

export function CreateActivityForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [name, setName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [projectTypeGeneral, setProjectTypeGeneral] = useState<string>('')
  const [projectTypeSpecific, setProjectTypeSpecific] = useState<string>('')
  const [creatorRole, setCreatorRole] = useState<string>('Creator')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [activityValue, setActivityValue] = useState<ActivityDateTimeValue | null>(null)
  const [showActivityPicker, setShowActivityPicker] = useState(false)
  const [activityLocation, setActivityLocation] = useState<ActivityLocationValue | null>(null)
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [projectStatus, setProjectStatus] = useState<string>('in-progress')
  const [hostProjects, setHostProjects] = useState<HostProjectOption[]>([])
  const [hostProjectsLoading, setHostProjectsLoading] = useState(false)
  const [hostProjectIds, setHostProjectIds] = useState<string[]>([])
  const [showHostSelector, setShowHostSelector] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const avatarHelpers = createAvatarUploadHelpers(supabase)
  const [callToJoinDescription, setCallToJoinDescription] = useState<string>('Join us!')
  const [callToJoinJoinByLocal, setCallToJoinJoinByLocal] = useState<string>('') // datetime-local value
  const [callToJoinRequireApproval, setCallToJoinRequireApproval] = useState<boolean>(true)
  const [callToJoinPrompt, setCallToJoinPrompt] = useState<string>('Why do you want to join this activity?')
  const [callToJoinRoles, setCallToJoinRoles] = useState<
    Array<{ id: string; label: string; activityRole: 'member' | 'manager' }>
  >([
    { id: 'default-member', label: 'Member', activityRole: 'member' },
  ])
  const [showCallToJoinModal, setShowCallToJoinModal] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const isActivitySelectionValid = !activityValue || !!activityValue.start

  useEffect(() => {
    const initialHost = searchParams?.get('host') || ''
    if (initialHost) {
      setHostProjectIds((prev) => (prev.includes(initialHost) ? prev : [...prev, initialHost]))
    }
  }, [searchParams])

  useEffect(() => {
    const fetchHostProjects = async () => {
      setHostProjectsLoading(true)
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()
        if (authError || !user) {
          setHostProjects([])
          setHostProjectsLoading(false)
          return
        }

        const { data: projects } = await supabase
          .from('portfolios')
          .select('id, user_id, metadata')
          .eq('type', 'projects')
          .order('created_at', { ascending: false })

        const options: HostProjectOption[] =
          projects
            ?.filter((p: any) => {
              const meta = p.metadata as any
              const managers: string[] = meta?.managers || []
              const isOwner = p.user_id === user.id
              const isManager = Array.isArray(managers) && managers.includes(user.id)
              return isOwner || isManager
            })
            .map((p: any) => {
              const meta = p.metadata as any
              const basic = meta?.basic || {}
              return {
                id: p.id as string,
                name: (basic.name as string) || 'Project',
                avatar: basic.avatar as string | undefined,
                emoji: basic.emoji as string | undefined,
                description: basic.description as string | undefined,
                projectType: (meta?.project_type_specific as string | undefined) ?? null,
              }
            }) ?? []

        setHostProjects(options)
      } catch (e) {
        console.error('Failed to load host projects for activities', e)
        setHostProjects([])
      } finally {
        setHostProjectsLoading(false)
      }
    }

    fetchHostProjects()
  }, [supabase])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (
        !file.type.startsWith('image/') &&
        !file.name.toLowerCase().endsWith('.heic') &&
        !file.name.toLowerCase().endsWith('.heif')
      ) {
        setError('Please select an image file')
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be less than 5MB')
        return
      }

      setError(null)

      try {
        const { ensureBrowserCompatibleImage } = await import('@/lib/utils/heic-converter')
        const compatibleFile = await ensureBrowserCompatibleImage(file)

        setAvatarFile(compatibleFile)
        setSelectedEmoji(null)

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
    setAvatarFile(null)
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

    if (!avatarFile && !selectedEmoji) {
      setError('Please upload an image or select an emoji')
      return
    }

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
      const formData = new FormData()
      formData.append('type', 'activities')
      formData.append('name', name.trim())
      if (hostProjectIds.length > 0) {
        formData.append('host_project_ids', JSON.stringify(hostProjectIds))
      }

      if (avatarFile) {
        formData.append('avatar', avatarFile)
      }
      if (selectedEmoji) {
        formData.append('emoji', selectedEmoji)
      }

      if (projectTypeGeneral && projectTypeSpecific) {
        formData.append('project_type_general', projectTypeGeneral)
        formData.append('project_type_specific', projectTypeSpecific)
      }

      formData.append('creator_role', creatorRole.trim() || 'Creator')
      formData.append('visibility', visibility)
      formData.append('project_status', projectStatus || '')

      // Call-to-join: on when activity is public (no enable/disable); only send config when public
      if (visibility !== 'private') {
        if (callToJoinDescription.trim().length > 0) {
          formData.append('activity_call_to_join_description', callToJoinDescription.trim())
        }
        if (callToJoinJoinByLocal && callToJoinJoinByLocal.trim().length > 0) {
          const dt = new Date(callToJoinJoinByLocal)
          if (!Number.isNaN(dt.getTime())) {
            formData.append('activity_call_to_join_join_by', dt.toISOString())
          }
        }
        formData.append(
          'activity_call_to_join_require_approval',
          callToJoinRequireApproval ? 'true' : 'false'
        )
        if (callToJoinRequireApproval && callToJoinPrompt.trim().length > 0) {
          formData.append('activity_call_to_join_prompt', callToJoinPrompt.trim())
        }
        if (callToJoinRoles.length > 0) {
          formData.append(
            'activity_call_to_join_roles',
            JSON.stringify(callToJoinRoles)
          )
        }
      }

      if (activityValue?.start) {
        formData.append('activity_datetime_start', activityValue.start)
        if (activityValue.end) {
          formData.append('activity_datetime_end', activityValue.end)
        }
        formData.append(
          'activity_datetime_in_progress',
          activityValue.inProgress ? 'true' : 'false'
        )
        formData.append('activity_datetime_all_day', activityValue.allDay ? 'true' : 'false')
      }

      if (activityLocation) {
        if (activityLocation.line1) {
          formData.append('activity_location_line1', activityLocation.line1)
        }
        if (activityLocation.city) {
          formData.append('activity_location_city', activityLocation.city)
        }
        if (activityLocation.state) {
          formData.append('activity_location_state', activityLocation.state)
        }
        if (activityLocation.country) {
          formData.append('activity_location_country', activityLocation.country)
        }
        if (activityLocation.countryCode) {
          formData.append('activity_location_country_code', activityLocation.countryCode)
        }
        if (activityLocation.stateCode) {
          formData.append('activity_location_state_code', activityLocation.stateCode)
        }
        formData.append(
          'activity_location_private',
          activityLocation.isExactLocationPrivate ? 'true' : 'false'
        )
      }

      const result = await createPortfolio(formData)

      if (result.error || !result.success) {
        setError(result.error || 'Failed to create activity')
        setLoading(false)
        return
      }

      if (!result.portfolioId) {
        setError('Activity created but no ID returned')
        setLoading(false)
        return
      }

      const redirectUrl = `/portfolio/activities/${result.portfolioId}`
      if (process.env.NODE_ENV === 'development') {
        console.log('Redirecting to:', redirectUrl, { type: 'activities', portfolioId: result.portfolioId })
      }
      window.location.href = redirectUrl
    } catch (err: any) {
      setError(err.message || 'Failed to create activity')
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
                <StickerAvatar alt={name || 'Preview'} type="activities" size={80} emoji={selectedEmoji} />
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
                  disabled={loading}
                >
                  <UIText>{avatarPreview ? 'Change Image' : 'Upload Image'}</UIText>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowEmojiPicker(true)}
                  disabled={loading}
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
            placeholder="Enter activity name"
            disabled={loading}
          />
        </div>

        <div>
          <UIText as="label" className="block mb-2">
            Host projects (optional)
          </UIText>
          {hostProjectIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {hostProjectIds.map((id) => {
                const p = hostProjects.find((x) => x.id === id)
                if (!p) return null
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 flex-shrink-0"
                  >
                    <StickerAvatar
                      src={p.avatar}
                      alt={p.name}
                      type="projects"
                      size={32}
                      emoji={p.emoji}
                      name={p.name}
                    />
                    <Content className="truncate max-w-[120px]">{p.name}</Content>
                    <button
                      type="button"
                      onClick={() => setHostProjectIds((prev) => prev.filter((x) => x !== id))}
                      className="p-1 rounded-full hover:bg-gray-200 text-gray-600"
                      aria-label="Remove host project"
                      disabled={loading}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}
              {hostProjectsLoading ? (
                <UIText className="text-gray-500">Loading...</UIText>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowHostSelector(true)}
                  disabled={loading}
                >
                  <UIText>Add host project</UIText>
                </Button>
              )}
            </div>
          ) : hostProjectsLoading ? (
            <UIText className="text-gray-500">Loading your projects...</UIText>
          ) : hostProjects.length === 0 ? (
            <UIText className="text-gray-500 text-sm">
              You can optionally link this activity to projects where you are an owner or manager.
            </UIText>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowHostSelector(true)}
              disabled={loading}
            >
              <UIText>Add host project</UIText>
            </Button>
          )}
        </div>

        <div className="mt-4">
          <UIText as="label" className="block mb-2">
            Activity date &amp; time
          </UIText>
          <div className="max-w-full">
            <ActivityDateTimeBadge
              value={activityValue || undefined}
              onClick={() => setShowActivityPicker(true)}
            />
          </div>
        </div>

        <div className="mt-4">
          <UIText as="label" className="block mb-2">
            Location
          </UIText>
          <div className="max-w-full">
            <ActivityLocationBadge
              value={activityLocation || undefined}
              canSeeFullLocation
              onClick={() => setShowLocationPicker(true)}
            />
          </div>
        </div>

        {/* Advanced settings: category, visibility, call to join, role — collapsed by default */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            aria-expanded={advancedOpen}
          >
            <UIText as="span" className="font-medium text-gray-900">
              Advanced settings
            </UIText>
            <svg
              className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {advancedOpen && (
            <div className="p-4 pt-2 space-y-4 border-t border-gray-200">
              <div>
                <UIText as="label" className="block mb-2">
                  Category
                </UIText>
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

              <div>
                <UIText as="label" className="block mb-2">
                  Visibility
                </UIText>
                <div className="flex flex-wrap gap-2">
                  {(['public', 'private'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVisibility(v)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        visibility === v
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                      disabled={loading}
                    >
                      {v === 'public' && 'Public'}
                      {v === 'private' && 'Private'}
                    </button>
                  ))}
                </div>
                <UIText as="p" className="text-xs text-gray-500 mt-1">
                  Private activities are only visible to you and will not appear in search or feeds.
                </UIText>
              </div>

              {/* Call to join; on when activity is public */}
              {visibility !== 'private' && (
                <div>
                  <UIText as="label" className="block mb-2">
                    Call to join
                  </UIText>
                  <UIText as="p" className="text-xs text-gray-500 mb-2">
                    Public activities show a call-to-join card so visitors can apply. Configure it below.
                  </UIText>
                  <div className="mt-2">
                    <Card variant="subtle" padding="sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <UIText as="h3" className="mb-1">
                            Call to join preview
                          </UIText>
                          <Content className="mb-1">
                            {callToJoinDescription || 'Join this activity.'}
                          </Content>
                          <UIText className="text-gray-600 text-xs">
                            {callToJoinJoinByLocal
                              ? `Join by: ${new Date(callToJoinJoinByLocal).toLocaleString()}`
                              : 'No join-by date: applications close when the activity ends or is archived.'}
                          </UIText>
                          <UIText className="text-gray-600 text-xs mt-1">
                            {callToJoinRequireApproval ? 'Requires approval' : 'Auto-join'}
                          </UIText>
                        </div>
                        <div className="flex-shrink-0">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowCallToJoinModal(true)}
                            disabled={loading}
                          >
                            <UIText>Edit</UIText>
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              )}

              <div>
                <UIText as="label" htmlFor="creator_role" className="block mb-2">
                  Your Role <span className="text-gray-500">(optional, defaults to &quot;Creator&quot;)</span>
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
                  Your role in this activity (max 2 words)
                </UIText>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            <UIText>{error}</UIText>
          </div>
        )}

        <div className="flex gap-4">
          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={loading || !name.trim() || (!avatarFile && !selectedEmoji)}
          >
            <UIText>{loading ? 'Creating...' : 'Create Activity'}</UIText>
          </Button>
        </div>
      </form>

      {showHostSelector && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
          <div
            className="bg-white rounded-xl w-auto mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <Card variant="default" padding="sm">
              <div className="mb-4">
                <UIText>Choose a host project (optional)</UIText>
              </div>
              {hostProjectsLoading ? (
                <div className="py-8 text-center">
                  <UIText className="text-gray-500">Loading projects...</UIText>
                </div>
              ) : hostProjects.length === 0 ? (
                <UIText className="text-gray-500 text-sm mb-4">
                  You are not an owner or manager of any projects yet.
                </UIText>
              ) : (
                <div className="grid grid-cols-3 gap-x-4 gap-y-8 mb-4">
                  {hostProjects
                    .filter((p) => !hostProjectIds.includes(p.id))
                    .map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        className="flex flex-col items-center gap-4 py-6 px-4 hover:opacity-80 transition-opacity"
                        onClick={() => {
                          setHostProjectIds((prev) => (prev.includes(project.id) ? prev : [...prev, project.id]))
                          setShowHostSelector(false)
                        }}
                      >
                        <StickerAvatar
                          src={project.avatar}
                          alt={project.name}
                          type="projects"
                          size={72}
                          emoji={project.emoji}
                          name={project.name}
                        />
                        <UIText className="text-center max-w-[96px] truncate" title={project.name}>
                          {project.name}
                        </UIText>
                      </button>
                    ))}
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setShowHostSelector(false)}>
                  <UIText>Close</UIText>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Call-to-join details popup */}
      {showCallToJoinModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
          <div
            className="bg-white rounded-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <Card variant="default" padding="sm">
              <div className="mb-4">
                <UIText as="h2">Configure call to join</UIText>
              </div>
              <div className="space-y-4">
                <div>
                  <UIText as="label" className="block mb-1">
                    Description
                  </UIText>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    rows={3}
                    value={callToJoinDescription}
                    onChange={(e) => setCallToJoinDescription(e.target.value)}
                  />
                </div>
                <div>
                  <UIText as="label" className="block mb-1">
                    Join by (optional)
                  </UIText>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    value={callToJoinJoinByLocal}
                    onChange={(e) => setCallToJoinJoinByLocal(e.target.value)}
                  />
                  <UIText as="p" className="text-xs text-gray-500 mt-1">
                    If left empty, it will be set relative to the activity end time or one week from now.
                  </UIText>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="create-activity-require-approval"
                    type="checkbox"
                    checked={callToJoinRequireApproval}
                    onChange={(e) => setCallToJoinRequireApproval(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <UIText as="label" htmlFor="create-activity-require-approval">
                    Require approval to join
                  </UIText>
                </div>
                {callToJoinRequireApproval && (
                  <div>
                    <UIText as="label" className="block mb-1">
                      Prompt (optional)
                    </UIText>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      rows={3}
                      value={callToJoinPrompt}
                      onChange={(e) => setCallToJoinPrompt(e.target.value)}
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowCallToJoinModal(false)}
                  >
                    <UIText>Close</UIText>
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setShowCallToJoinModal(false)}
                  >
                    <UIText>Save</UIText>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {showActivityPicker && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
          <div className="w-full h-full md:h-auto md:max-w-2xl px-0 md:px-4">
            <Card>
              <ActivityDateTimePicker
                portfolioTitle={name || 'Activity'}
                initialValue={activityValue}
                onChange={setActivityValue}
              />
              <div className="mt-4 flex justify-between items-center gap-2 pb-[calc(var(--app-topnav-height)+env(safe-area-inset-bottom,0px)+16px)] md:pb-0">
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  onClick={() => {
                    setActivityValue(null)
                    setShowActivityPicker(false)
                  }}
                >
                  <UIText>Clear</UIText>
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowActivityPicker(false)}
                  >
                    <UIText>Cancel</UIText>
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!isActivitySelectionValid}
                    onClick={() => setShowActivityPicker(false)}
                  >
                    <UIText>Done</UIText>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {showLocationPicker && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
          <div className="w-full h-full md:h-auto md:max-w-2xl px-0 md:px-4">
            <Card>
              <ActivityLocationPicker
                portfolioTitle={name || 'Activity'}
                initialValue={activityLocation}
                onChange={setActivityLocation}
              />
              <div className="mt-4 flex justify-between items-center gap-2 pb-[calc(var(--app-topnav-height)+env(safe-area-inset-bottom,0px)+16px)] md:pb-0">
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  onClick={() => {
                    setActivityLocation(null)
                    setShowLocationPicker(false)
                  }}
                >
                  <UIText>Clear</UIText>
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowLocationPicker(false)}
                  >
                    <UIText>Cancel</UIText>
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setShowLocationPicker(false)}
                  >
                    <UIText>Done</UIText>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

