'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createAvatarUploadHelpers } from '@/lib/storage/avatars-client'
import { createPortfolio } from '@/app/portfolio/create/[type]/actions'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getFaviconUrl } from '@/lib/portfolio/getFaviconUrl'
import { ProjectTypeSelector } from './ProjectTypeSelector'
import { UIText, Button, Card, Content, UIButtonText } from '@/components/ui'
import { EmojiPicker } from './EmojiPicker'
import { StickerAvatar } from './StickerAvatar'
import { ActivityDateTimeField, ActivityLocationField } from './activity-fields'
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

interface HostCommunityOption {
  id: string
  name: string
  avatar?: string
  emoji?: string
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
  const [activityLocation, setActivityLocation] = useState<ActivityLocationValue | null>(null)
  const [projectStatus, setProjectStatus] = useState<string>('live')
  const [hostProjects, setHostProjects] = useState<HostProjectOption[]>([])
  const [hostProjectsLoading, setHostProjectsLoading] = useState(false)
  const [hostProjectIds, setHostProjectIds] = useState<string[]>([])
  const [hostCommunities, setHostCommunities] = useState<HostCommunityOption[]>([])
  const [hostCommunitiesLoading, setHostCommunitiesLoading] = useState(false)
  const [hostCommunityIds, setHostCommunityIds] = useState<string[]>([])
  const [showHostSelector, setShowHostSelector] = useState(false)
  const [hostSelectorTab, setHostSelectorTab] = useState<'projects' | 'communities'>('projects')
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
  const [isExternal, setIsExternal] = useState(false)
  const [externalLink, setExternalLink] = useState('')
  const [extractingLink, setExtractingLink] = useState(false)
  const [description, setDescription] = useState('')
  const [existingActivity, setExistingActivity] = useState<{
    id: string
    name: string
    avatar?: string
    emoji?: string
    slug?: string
  } | null>(null)
  const [linkVerified, setLinkVerified] = useState(false)
  const [iAmGoing, setIAmGoing] = useState(true)

  const handleContinue = async () => {
    const url = externalLink.trim()
    if (!url) {
      setError('Please enter a link')
      return
    }
    setExtractingLink(true)
    setError(null)
    setExistingActivity(null)
    try {
      // Check for duplicate link first
      const checkRes = await fetch(
        `/api/activities/find-by-external-link?url=${encodeURIComponent(url)}`
      )
      const checkData = await checkRes.json()
      if (checkData.existing && checkData.activity) {
        setExistingActivity(checkData.activity)
        setLinkVerified(false)
        setExtractingLink(false)
        return
      }

      const res = await fetch('/api/activities/extract-external-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to extract event information')
        return
      }
      if (data.title) setName(data.title)
      if (data.description) setDescription(data.description)
      if (data.time?.start) {
        setActivityValue({
          start: data.time.start,
          end: data.time.end || undefined,
          allDay: false,
          inProgress: false,
        })
      }
      if (data.locationStructured && Object.keys(data.locationStructured).length > 0) {
        setActivityLocation({
          ...data.locationStructured,
          ...(data.location && { line1: data.location }),
        })
      } else if (data.location) {
        setActivityLocation({ line1: data.location })
      }
      setLinkVerified(true)
    } catch (err: any) {
      setError(err.message || 'Failed to extract event information')
    } finally {
      setExtractingLink(false)
    }
  }

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

  useEffect(() => {
    const fetchHostCommunities = async () => {
      setHostCommunitiesLoading(true)
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()
        if (authError || !user) {
          setHostCommunities([])
          setHostCommunitiesLoading(false)
          return
        }

        const { data: communities } = await supabase
          .from('portfolios')
          .select('id, user_id, metadata')
          .eq('type', 'community')
          .order('created_at', { ascending: false })

        const options: HostCommunityOption[] =
          communities
            ?.filter((c: any) => {
              const meta = c.metadata as any
              const managers: string[] = meta?.managers || []
              const isOwner = c.user_id === user.id
              const isManager = Array.isArray(managers) && managers.includes(user.id)
              return isOwner || isManager
            })
            .map((c: any) => {
              const meta = c.metadata as any
              const basic = meta?.basic || {}
              return {
                id: c.id as string,
                name: (basic.name as string) || 'Community',
                avatar: basic.avatar as string | undefined,
                emoji: basic.emoji as string | undefined,
              }
            }) ?? []

        setHostCommunities(options)
      } catch (e) {
        console.error('Failed to load host communities for activities', e)
        setHostCommunities([])
      } finally {
        setHostCommunitiesLoading(false)
      }
    }

    fetchHostCommunities()
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

    if (!isExternal && !avatarFile && !selectedEmoji) {
      setError('Please upload an image or select an emoji')
      return
    }

    if (!isExternal && creatorRole.trim()) {
      const words = creatorRole.trim().split(/\s+/)
      if (words.length > 2) {
        setError('Creator role must be 2 words or less')
        return
      }
    }

    if (isExternal && !externalLink.trim()) {
      setError('Event link is required for external activities')
      return
    }

    if (isExternal && existingActivity) {
      setError('This event already exists. Use the link above to view it.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('type', 'activities')
      formData.append('name', name.trim())
      if (description.trim()) {
        formData.append('description', description.trim())
      }
      if (isExternal) {
        formData.append('is_external', 'true')
        formData.append('external_link', externalLink.trim())
      } else {
        if (hostProjectIds.length > 0) {
          formData.append('host_project_ids', JSON.stringify(hostProjectIds))
        }
        if (hostCommunityIds.length > 0) {
          formData.append('host_community_ids', JSON.stringify(hostCommunityIds))
        }
      }

      if (avatarFile) {
        formData.append('avatar', avatarFile)
      }
      if (selectedEmoji) {
        formData.append('emoji', selectedEmoji)
      }
      if (isExternal && externalLink.trim()) {
        const faviconUrl = getFaviconUrl(externalLink.trim())
        if (faviconUrl) formData.append('avatar_url', faviconUrl)
        formData.append('i_am_going', iAmGoing ? 'true' : 'false')
      }

      if (!isExternal && projectTypeGeneral && projectTypeSpecific) {
        formData.append('project_type_general', projectTypeGeneral)
        formData.append('project_type_specific', projectTypeSpecific)
      }

      formData.append('creator_role', isExternal ? 'Uploader' : (creatorRole.trim() || 'Creator'))
      formData.append('visibility', isExternal ? 'public' : visibility)
      formData.append('project_status', projectStatus || '')

      // Call-to-join: only for non-external, when activity is public
      if (!isExternal && visibility !== 'private') {
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
        if (activityLocation.online) {
          formData.append('activity_location_online', 'true')
          if (activityLocation.onlineUrl) {
            formData.append('activity_location_online_url', activityLocation.onlineUrl)
          }
          if (activityLocation.isOnlineLocationPrivate) {
            formData.append('activity_location_online_private', 'true')
          }
        } else {
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
        {/* External toggle */}
        <div className="flex items-center justify-between">
          <UIText as="label" className="block">
            External activity
          </UIText>
          <button
            type="button"
            role="switch"
            aria-checked={isExternal}
            onClick={() => {
              setIsExternal((prev) => !prev)
              if (!isExternal) {
                setExternalLink('')
                setExistingActivity(null)
                setLinkVerified(false)
                setIAmGoing(true)
                setHostProjectIds([])
                setHostCommunityIds([])
                setVisibility('public')
              }
              setError(null)
            }}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              isExternal ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                isExternal ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <UIText as="p" className="text-xs text-gray-500 -mt-2">
          External activities link to events on other sites. Anyone can join without approval.
        </UIText>

        {isExternal && (
          <div className="space-y-4">
            <div>
              <UIText as="label" className="block mb-2">
                Event link
              </UIText>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={externalLink}
                  onChange={(e) => {
                    setExternalLink(e.target.value)
                    setExistingActivity(null)
                    setLinkVerified(false)
                  }}
                  placeholder="https://..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleContinue}
                  disabled={extractingLink || !externalLink.trim()}
                >
                  <UIText>{extractingLink ? 'Extracting...' : 'Continue'}</UIText>
                </Button>
              </div>
            </div>
            {existingActivity && (
              <Link
                href={getPortfolioUrl('activities', existingActivity.id)}
                className="mt-3 flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                <div className="flex-shrink-0">
                  <StickerAvatar
                    src={existingActivity.avatar}
                    alt={existingActivity.name}
                    type="activities"
                    size={48}
                    emoji={existingActivity.emoji}
                    name={existingActivity.name}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <UIText as="div" className="text-amber-800 font-medium mb-0.5">
                    This event already exists
                  </UIText>
                  <Content className="text-amber-700 mb-1">
                    {existingActivity.name}
                  </Content>
                  <UIText as="span" className="text-amber-600 text-sm">
                    View existing activity →
                  </UIText>
                </div>
              </Link>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            <UIText>{error}</UIText>
          </div>
        )}

        {(!isExternal || linkVerified) && (
        <>
        <div>
          <UIText as="label" className="block mb-2">
            Avatar {!isExternal && <span className="text-red-500">*</span>}
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
              ) : isExternal && externalLink.trim() ? (
                <img
                  src={getFaviconUrl(externalLink.trim(), 128)}
                  alt="Site favicon"
                  className="h-20 w-20 rounded-full object-cover border-2 border-gray-300 bg-white"
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
                {isExternal ? 'Uses site favicon by default. Upload or select emoji to override.' : 'Please upload an image or select an emoji'}
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

        {isExternal && (
          <div>
            <UIText as="label" className="block mb-2">
              Description
            </UIText>
            <UIText as="p" className="text-xs text-gray-500 mb-2">
              You can also add relevant linnks (NOT LinkedIn!) This description will be used to build the advance knowledge graph that help us to find the best opportunities for you.
            </UIText>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Short description of the event"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>
        )}

        {isExternal && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="i_am_going"
              checked={iAmGoing}
              onChange={(e) => setIAmGoing(e.target.checked)}
              disabled={loading}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <UIText as="label" htmlFor="i_am_going" className="cursor-pointer">
              I&apos;m going to this event
            </UIText>
          </div>
        )}

        {!isExternal && (
        <div>
          <UIText as="label" className="block mb-2">
            Hosts (optional)
          </UIText>
          <UIText as="p" className="text-xs text-gray-500 mb-2">
            Projects and communities that host this activity. You can add projects and communities where you are owner or manager.
          </UIText>
          <div className="flex flex-wrap gap-2">
            {hostProjectIds.map((id) => {
              const p = hostProjects.find((x) => x.id === id)
              if (!p) return null
              return (
                <div
                  key={`project-${id}`}
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
            {hostCommunityIds.map((id) => {
              const c = hostCommunities.find((x) => x.id === id)
              if (!c) return null
              return (
                <div
                  key={`community-${id}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 flex-shrink-0"
                >
                  <StickerAvatar
                    src={c.avatar}
                    alt={c.name}
                    type="community"
                    size={32}
                    emoji={c.emoji}
                    name={c.name}
                  />
                  <Content className="truncate max-w-[120px]">{c.name}</Content>
                  <button
                    type="button"
                    onClick={() => setHostCommunityIds((prev) => prev.filter((x) => x !== id))}
                    className="p-1 rounded-full hover:bg-gray-200 text-gray-600"
                    aria-label="Remove host community"
                    disabled={loading}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
            {(hostProjectsLoading || hostCommunitiesLoading) ? (
              <UIText className="text-gray-500">Loading...</UIText>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setHostSelectorTab('projects')
                  setShowHostSelector(true)
                }}
                disabled={loading}
              >
                <UIText>Add host</UIText>
              </Button>
            )}
          </div>
          {!hostProjectsLoading && !hostCommunitiesLoading && hostProjects.length === 0 && hostCommunities.length === 0 && (
            <UIText className="text-gray-500 text-sm mt-1">
              You can optionally link this activity to projects or communities where you are an owner or manager.
            </UIText>
          )}
        </div>
        )}

        <div className="mt-4">
          <UIText as="label" className="block mb-2">
            Activity date &amp; time
          </UIText>
          <div className="max-w-full">
            <ActivityDateTimeField
              value={activityValue}
              onChange={setActivityValue}
              portfolioTitle={name || 'Activity'}
              requireValidSelection
            />
          </div>
        </div>

        <div className="mt-4">
          <UIText as="label" className="block mb-2">
            Location
          </UIText>
          <div className="max-w-full">
            <ActivityLocationField
              value={activityLocation}
              onChange={setActivityLocation}
              portfolioTitle={name || 'Activity'}
              canSeeFullLocation
            />
          </div>
        </div>

        {/* Advanced settings: category, visibility, call to join, role — collapsed by default (hidden for external) */}
        {!isExternal && (
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
        )}

        <div className="flex gap-4">
          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={loading || !!existingActivity || !name.trim() || (!isExternal && !avatarFile && !selectedEmoji)}
          >
            <UIText>
              {existingActivity ? 'Event already exists' : loading ? 'Creating...' : 'Create Activity'}
            </UIText>
          </Button>
        </div>
        </>
        )}
      </form>

      {showHostSelector && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
          <div
            className="bg-white rounded-xl w-auto mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <Card variant="default" padding="sm">
              <div className="mb-4">
                <UIText as="h2">Add host</UIText>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setHostSelectorTab('projects')}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      hostSelectorTab === 'projects' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Projects
                  </button>
                  <button
                    type="button"
                    onClick={() => setHostSelectorTab('communities')}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      hostSelectorTab === 'communities' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Communities
                  </button>
                </div>
              </div>
              {hostSelectorTab === 'projects' ? (
                hostProjectsLoading ? (
                  <div className="py-8 text-center">
                    <UIText className="text-gray-500">Loading projects...</UIText>
                  </div>
                ) : hostProjects.filter((p) => !hostProjectIds.includes(p.id)).length === 0 ? (
                  <UIText className="text-gray-500 text-sm mb-4">
                    No more projects to add, or you are not owner/manager of any.
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
                )
              ) : hostCommunitiesLoading ? (
                <div className="py-8 text-center">
                  <UIText className="text-gray-500">Loading communities...</UIText>
                </div>
              ) : hostCommunities.filter((c) => !hostCommunityIds.includes(c.id)).length === 0 ? (
                <UIText className="text-gray-500 text-sm mb-4">
                  No more communities to add, or you are not owner/manager of any.
                </UIText>
              ) : (
                <div className="grid grid-cols-3 gap-x-4 gap-y-8 mb-4">
                  {hostCommunities
                    .filter((c) => !hostCommunityIds.includes(c.id))
                    .map((community) => (
                      <button
                        key={community.id}
                        type="button"
                        className="flex flex-col items-center gap-4 py-6 px-4 hover:opacity-80 transition-opacity"
                        onClick={() => {
                          setHostCommunityIds((prev) => (prev.includes(community.id) ? prev : [...prev, community.id]))
                          setShowHostSelector(false)
                        }}
                      >
                        <StickerAvatar
                          src={community.avatar}
                          alt={community.name}
                          type="community"
                          size={72}
                          emoji={community.emoji}
                          name={community.name}
                        />
                        <UIText className="text-center max-w-[96px] truncate" title={community.name}>
                          {community.name}
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

    </>
  )
}

