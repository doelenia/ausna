'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import {
  Portfolio,
  isProjectPortfolio,
  isCommunityPortfolio,
  isHumanPortfolio,
  PortfolioVisibility,
  ActivityCallToJoinConfig,
  HumanAvailabilitySchedule,
} from '@/types/portfolio'
import { createClient } from '@/lib/supabase/client'
import { createAvatarUploadHelpers } from '@/lib/storage/avatars-client'
import { getPortfolioBasic } from '@/lib/portfolio/utils'
import { updatePortfolio, updateActivityCallToJoin } from '@/app/portfolio/[type]/[id]/actions'
import { EmojiPicker } from './EmojiPicker'
import { StickerAvatar } from './StickerAvatar'
import { DescriptionEditorPopup } from './DescriptionPopups'
import { ImageViewerPopup } from './ImageViewerPopup'
import { ProjectTypeSelector } from './ProjectTypeSelector'
import { CommunityTypeSelector } from './CommunityTypeSelector'
import { Title, UIText, Button, Card, Content } from '@/components/ui'
import { ActivityDateTimeField, ActivityLocationField } from './activity-fields'
import { ActivityLinkBadge } from './ActivityLinkBadge'
import type { ActivityLocationValue } from '@/lib/location'
import type { ActivityDateTimeValue } from '@/lib/datetime'

interface PortfolioEditorProps {
  portfolio: Portfolio
  onCancel: () => void
  onSave: () => void
  initialShowActivityPicker?: boolean
  initialShowLocationPicker?: boolean
}

const HUMAN_AVAILABILITY_DAYS: Array<keyof HumanAvailabilitySchedule> = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

const HUMAN_AVAILABILITY_DAY_LABELS: Record<keyof HumanAvailabilitySchedule, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

function createDefaultAvailabilitySchedule(): HumanAvailabilitySchedule {
  const schedule: HumanAvailabilitySchedule = {}
  for (const day of HUMAN_AVAILABILITY_DAYS) {
    schedule[day] = { enabled: false }
  }
  return schedule
}

function createSuggestedAvailabilitySchedule(): HumanAvailabilitySchedule {
  const schedule = createDefaultAvailabilitySchedule()
  for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as Array<
    keyof HumanAvailabilitySchedule
  >) {
    schedule[day] = { enabled: true, startTime: '18:00', endTime: '21:00' }
  }
  for (const day of ['saturday', 'sunday'] as Array<keyof HumanAvailabilitySchedule>) {
    schedule[day] = { enabled: true, startTime: '10:00', endTime: '21:00' }
  }
  return schedule
}

function cloneAvailabilitySchedule(
  schedule: HumanAvailabilitySchedule | null | undefined
): HumanAvailabilitySchedule {
  if (!schedule) return createDefaultAvailabilitySchedule()
  const next: HumanAvailabilitySchedule = {}
  for (const day of HUMAN_AVAILABILITY_DAYS) {
    const value = schedule[day]
    if (value) {
      next[day] = {
        enabled: Boolean(value.enabled),
        ...(value.startTime ? { startTime: value.startTime } : {}),
        ...(value.endTime ? { endTime: value.endTime } : {}),
      }
    } else {
      next[day] = { enabled: false }
    }
  }
  return next
}

function hasAnyAvailability(schedule: HumanAvailabilitySchedule | null | undefined): boolean {
  if (!schedule) return false
  for (const day of HUMAN_AVAILABILITY_DAYS) {
    const value = schedule[day]
    if (value && (value.enabled || value.startTime || value.endTime)) {
      return true
    }
  }
  return false
}

function getAvailabilityValidationError(
  schedule: HumanAvailabilitySchedule | null | undefined
): string | null {
  if (!schedule) return null
  for (const day of HUMAN_AVAILABILITY_DAYS) {
    const value = schedule[day]
    if (!value) continue
    const { startTime, endTime } = value
    if (startTime && endTime && endTime <= startTime) {
      return `End time must be after start time (${HUMAN_AVAILABILITY_DAY_LABELS[day]})`
    }
  }
  return null
}

function summarizeAvailabilitySchedule(
  schedule: HumanAvailabilitySchedule | null | undefined
): string {
  if (!schedule || !hasAnyAvailability(schedule)) {
    return 'No availability set'
  }

  type DayInfo = {
    dayKey: keyof HumanAvailabilitySchedule
    label: string
    enabled: boolean
    startTime?: string
    endTime?: string
  }

  const dayInfos: DayInfo[] = HUMAN_AVAILABILITY_DAYS.map((day) => {
    const value = schedule[day]
    return {
      dayKey: day,
      label: HUMAN_AVAILABILITY_DAY_LABELS[day],
      enabled: !!value?.enabled,
      startTime: value?.startTime,
      endTime: value?.endTime,
    }
  })

  const normalizeRange = (info: DayInfo) => {
    if (!info.enabled && !info.startTime && !info.endTime) return 'off'
    if (!info.startTime && !info.endTime) return 'any'
    if (info.startTime && info.endTime) return `${info.startTime}–${info.endTime}`
    if (info.startTime && !info.endTime) return `${info.startTime}–`
    if (!info.startTime && info.endTime) return `–${info.endTime}`
    return 'any'
  }

  const segments: string[] = []
  let i = 0
  while (i < dayInfos.length) {
    const current = dayInfos[i]
    const range = normalizeRange(current)
    if (range === 'off') {
      i += 1
      continue
    }

    let j = i + 1
    while (j < dayInfos.length && normalizeRange(dayInfos[j]) === range) {
      j += 1
    }

    const groupDays = dayInfos.slice(i, j)
    const dayLabel =
      groupDays.length === 1
        ? groupDays[0].label
        : `${groupDays[0].label}–${groupDays[groupDays.length - 1].label}`

    let rangeLabel: string
    if (range === 'any') {
      rangeLabel = 'any time'
    } else {
      rangeLabel = range
    }

    segments.push(`${dayLabel}: ${rangeLabel}`)
    i = j
  }

  return segments.join(' · ')
}

function AvailabilityPreviewCard({
  schedule,
}: {
  schedule: HumanAvailabilitySchedule | null | undefined
}) {
  const summary = summarizeAvailabilitySchedule(schedule)
  return (
    <Card variant="subtle" padding="sm">
      <div className="flex flex-col gap-1">
        <UIText as="span">Weekly availability</UIText>
        <Content>{summary}</Content>
      </div>
    </Card>
  )
}

export function PortfolioEditor({
  portfolio,
  onCancel,
  onSave,
  initialShowActivityPicker,
  initialShowLocationPicker,
}: PortfolioEditorProps) {
  const basic = getPortfolioBasic(portfolio)
  const metadata = portfolio.metadata as any
  const [name, setName] = useState(basic.name)
  const [description, setDescription] = useState(basic.description || '')
  const [showDescriptionEditor, setShowDescriptionEditor] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(basic.avatar || null)
  const [showAvatarPopup, setShowAvatarPopup] = useState(false)
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(metadata?.basic?.emoji || null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [projectTypeGeneral, setProjectTypeGeneral] = useState<string>(metadata?.project_type_general || '')
  const [projectTypeSpecific, setProjectTypeSpecific] = useState<string>(metadata?.project_type_specific || '')
  const [visibility, setVisibility] = useState<PortfolioVisibility>(
    (portfolio as any).visibility === 'private' ? 'private' : 'public'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const avatarHelpers = createAvatarUploadHelpers(supabase)
  const initialActivity =
    (metadata?.properties?.activity_datetime as ActivityDateTimeValue | undefined) || null
  const [activityValue, setActivityValue] = useState<ActivityDateTimeValue | null>(initialActivity)
  const initialLocation =
    (metadata?.properties?.location as ActivityLocationValue | undefined) || null
  const [activityLocation, setActivityLocation] = useState<ActivityLocationValue | null>(
    initialLocation
  )
  const [projectStatus, setProjectStatus] = useState<string>(
    metadata?.status || (!initialActivity ? 'live' : '')
  )
  const initialCallToJoin: ActivityCallToJoinConfig | null =
    (metadata?.properties?.call_to_join as ActivityCallToJoinConfig | undefined) || null
  const [callToJoinConfig, setCallToJoinConfig] = useState<ActivityCallToJoinConfig | null>(
    initialCallToJoin
  )
  const [showCallToJoinModal, setShowCallToJoinModal] = useState(false)
  const initialHostProjectIds: string[] =
    (metadata?.properties?.host_project_ids as string[] | undefined) ||
    ((portfolio as any).host_project_id ? [(portfolio as any).host_project_id] : [])
  const [hostProjectIds, setHostProjectIds] = useState<string[]>(initialHostProjectIds)
  const initialHostCommunityIds: string[] =
    (metadata?.properties?.host_community_ids as string[] | undefined) || []
  const [hostCommunityIds, setHostCommunityIds] = useState<string[]>(initialHostCommunityIds)
  const [hostProjects, setHostProjects] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string }>>([])
  const [hostProjectsLoading, setHostProjectsLoading] = useState(false)
  const [hostCommunities, setHostCommunities] = useState<Array<{ id: string; name: string; avatar?: string; emoji?: string }>>([])
  const [hostCommunitiesLoading, setHostCommunitiesLoading] = useState(false)
  const [showHostSelector, setShowHostSelector] = useState(false)
  const [hostSelectorTab, setHostSelectorTab] = useState<'projects' | 'communities'>('projects')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const membersList: string[] = metadata?.members || []
  const isExternalActivityInit = portfolio.type === 'activities' && (metadata?.properties as any)?.external === true
  const [creatorGoing, setCreatorGoing] = useState<boolean>(
    isExternalActivityInit ? membersList.includes(portfolio.user_id) : true
  )
  const initialHumanAutoCityLocationEnabled: boolean =
    isHumanPortfolio(portfolio) &&
    !!(metadata?.properties && Object.prototype.hasOwnProperty.call(metadata.properties, 'auto_city_location_enabled'))
      ? Boolean(metadata.properties.auto_city_location_enabled)
      : true
  const [humanAutoCityLocationEnabled, setHumanAutoCityLocationEnabled] = useState<boolean>(
    initialHumanAutoCityLocationEnabled
  )
  const initialAvailabilitySchedule: HumanAvailabilitySchedule | null =
    (isHumanPortfolio(portfolio) &&
      (metadata?.properties?.availability_schedule as HumanAvailabilitySchedule | undefined)) ||
    null
  const [availabilitySchedule, setAvailabilitySchedule] = useState<HumanAvailabilitySchedule>(
    () => cloneAvailabilitySchedule(initialAvailabilitySchedule)
  )
  const [availabilityScheduleDraft, setAvailabilityScheduleDraft] =
    useState<HumanAvailabilitySchedule | null>(null)
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false)

  const availabilityValidationError = useMemo(
    () => getAvailabilityValidationError(availabilityScheduleDraft || availabilitySchedule),
    [availabilityScheduleDraft, availabilitySchedule]
  )

  useEffect(() => {
    if (portfolio.type !== 'activities') return
    let cancelled = false
    const load = async () => {
      setHostProjectsLoading(true)
      try {
        const { data: { user: u } } = await supabase.auth.getUser()
        if (!u || cancelled) return
        const { data: projects } = await supabase
          .from('portfolios')
          .select('id, user_id, metadata')
          .eq('type', 'projects')
          .order('created_at', { ascending: false })
        const list = (projects || []).filter((p: any) => {
          const meta = p.metadata as any
          const managers: string[] = meta?.managers || []
          return p.user_id === u.id || managers.includes(u.id)
        }).map((p: any) => {
          const meta = p.metadata as any
          const basic = meta?.basic || {}
          return {
            id: p.id,
            name: (basic.name as string) || 'Project',
            avatar: basic.avatar as string | undefined,
            emoji: basic.emoji as string | undefined,
          }
        })
        if (!cancelled) setHostProjects(list)
      } catch (e) {
        console.error('Failed to load host projects', e)
      } finally {
        if (!cancelled) setHostProjectsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [portfolio.type])

  useEffect(() => {
    if (portfolio.type !== 'activities') return
    let cancelled = false
    const load = async () => {
      setHostCommunitiesLoading(true)
      try {
        const { data: { user: u } } = await supabase.auth.getUser()
        if (!u || cancelled) return
        const { data: communities } = await supabase
          .from('portfolios')
          .select('id, user_id, metadata')
          .eq('type', 'community')
          .order('created_at', { ascending: false })
        const list = (communities || []).filter((c: any) => {
          const meta = c.metadata as any
          const managers: string[] = meta?.managers || []
          return c.user_id === u.id || managers.includes(u.id)
        }).map((c: any) => {
          const meta = c.metadata as any
          const basic = meta?.basic || {}
          return {
            id: c.id,
            name: (basic.name as string) || 'Community',
            avatar: basic.avatar as string | undefined,
            emoji: basic.emoji as string | undefined,
          }
        })
        if (!cancelled) setHostCommunities(list)
      } catch (e) {
        console.error('Failed to load host communities', e)
      } finally {
        if (!cancelled) setHostCommunitiesLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [portfolio.type])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.heic') && !file.name.toLowerCase().endsWith('.heif')) {
        setError('Please select an image file')
        return
      }
      
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

    if (description.length > 3000) {
      setError('Description must be 3000 characters or less')
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
      const actProps = (portfolio.metadata as any)?.properties || {}
      const isExternalAct = portfolio.type === 'activities' && actProps.external === true
      formData.append('portfolioId', portfolio.id)
      formData.append('name', name.trim())
      formData.append('description', description.trim())
      if (avatarFile) {
        formData.append('avatar', avatarFile)
      }
      // Only allow emoji for non-human portfolios
      if (!isHumanPortfolio(portfolio)) {
        if (selectedEmoji) {
          formData.append('emoji', selectedEmoji)
        } else if (!avatarFile && !basic.avatar) {
          // If removing both image and emoji, send empty string to clear emoji
          formData.append('emoji', '')
        }
      }
      if (projectTypeGeneral && projectTypeSpecific) {
        formData.append('project_type_general', projectTypeGeneral)
        formData.append('project_type_specific', projectTypeSpecific)
      }
      if (isProjectPortfolio(portfolio) || portfolio.type === 'activities') {
        formData.append('visibility', isExternalAct ? 'public' : visibility)
        formData.append('project_status', projectStatus || '')
        if (activityValue?.start) {
          formData.append('activity_datetime_start', activityValue.start)
          if (activityValue.end) {
            formData.append('activity_datetime_end', activityValue.end)
          }
          formData.append('activity_datetime_in_progress', activityValue.inProgress ? 'true' : 'false')
          formData.append('activity_datetime_all_day', activityValue.allDay ? 'true' : 'false')
        } else {
          formData.append('activity_datetime_start', '')
          formData.append('activity_datetime_end', '')
          formData.append('activity_datetime_in_progress', '')
          formData.append('activity_datetime_all_day', '')
        }
        if (activityLocation) {
          if (activityLocation.online) {
            formData.append('activity_location_online', 'true')
            formData.append('activity_location_online_url', activityLocation.onlineUrl || '')
            formData.append(
              'activity_location_online_private',
              activityLocation.isOnlineLocationPrivate ? 'true' : 'false'
            )
          } else {
            formData.append('activity_location_online', 'false')
            if (activityLocation.line1) {
              formData.append('activity_location_line1', activityLocation.line1)
            } else {
              formData.append('activity_location_line1', '')
            }
            if (activityLocation.city) {
              formData.append('activity_location_city', activityLocation.city)
            } else {
              formData.append('activity_location_city', '')
            }
            if (activityLocation.state) {
              formData.append('activity_location_state', activityLocation.state)
            } else {
              formData.append('activity_location_state', '')
            }
            if (activityLocation.country) {
              formData.append('activity_location_country', activityLocation.country)
            } else {
              formData.append('activity_location_country', '')
            }
            if (activityLocation.countryCode) {
              formData.append('activity_location_country_code', activityLocation.countryCode)
            } else {
              formData.append('activity_location_country_code', '')
            }
            if (activityLocation.stateCode) {
              formData.append('activity_location_state_code', activityLocation.stateCode)
            } else {
              formData.append('activity_location_state_code', '')
            }
            formData.append(
              'activity_location_private',
              activityLocation.isExactLocationPrivate ? 'true' : 'false'
            )
          }
        } else {
          formData.append('activity_location_online', '')
          formData.append('activity_location_line1', '')
          formData.append('activity_location_city', '')
          formData.append('activity_location_state', '')
          formData.append('activity_location_country', '')
          formData.append('activity_location_country_code', '')
          formData.append('activity_location_state_code', '')
          formData.append('activity_location_private', '')
        }
      }
      if (isHumanPortfolio(portfolio)) {
        formData.append(
          'human_auto_city_location_enabled',
          humanAutoCityLocationEnabled ? 'true' : 'false'
        )
        formData.append(
          'human_availability_schedule',
          hasAnyAvailability(availabilitySchedule) ? JSON.stringify(availabilitySchedule) : ''
        )
      }
      if (portfolio.type === 'activities' && !isExternalAct) {
        formData.append('host_project_ids', JSON.stringify(hostProjectIds))
        formData.append('host_community_ids', JSON.stringify(hostCommunityIds))
      }
      if (portfolio.type === 'activities' && isExternalAct) {
        formData.append('i_am_going', creatorGoing ? 'true' : 'false')
      }

      const result = await updatePortfolio(formData)

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      // Update activity call-to-join configuration from editor (skip for external)
      if (portfolio.type === 'activities' && !isExternalAct) {
        const cfg: ActivityCallToJoinConfig =
          callToJoinConfig ||
          initialCallToJoin || {
            enabled: (visibility !== 'private'),
            description: 'Join us!',
            join_by: null,
            require_approval: true,
            prompt: 'Why do you want to join this activity?',
            roles: [
              {
                id: 'default-member',
                label: 'Member',
                activityRole: 'member',
              },
            ],
            join_by_auto_managed: true,
          }

        await updateActivityCallToJoin(portfolio.id, {
          enabled: (visibility !== 'private'),
          description: cfg.description,
          joinBy: cfg.join_by ?? null,
          requireApproval: cfg.require_approval ?? true,
          prompt: cfg.prompt ?? null,
          roles: (cfg.roles || []).map((r) => ({
            id: r.id,
            label: r.label,
            activityRole: r.activityRole,
          })),
        })
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
      <DescriptionEditorPopup
        open={showDescriptionEditor}
        value={description}
        onChange={setDescription}
        onClose={() => setShowDescriptionEditor(false)}
      />
      {avatarPreview && (
        <ImageViewerPopup
          open={showAvatarPopup}
          src={avatarPreview}
          alt={name || basic.name || 'Avatar'}
          onClose={() => setShowAvatarPopup(false)}
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
                      <StickerAvatar
                        src={avatarPreview}
                        alt={name || basic.name || 'Avatar preview'}
                        type={portfolio.type}
                        size={80}
                        onClick={() => setShowAvatarPopup(true)}
                        className="flex-shrink-0 transition-transform hover:rotate-3"
                      />
                    ) : selectedEmoji && !isHumanPortfolio(portfolio) ? (
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
                      {!isHumanPortfolio(portfolio) && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setShowEmojiPicker(true)}
                        >
                          <UIText>{selectedEmoji ? 'Change Emoji' : 'Select Emoji'}</UIText>
                        </Button>
                      )}
                    </div>
                    {(avatarFile || (!isHumanPortfolio(portfolio) && selectedEmoji) || basic.avatar || (!isHumanPortfolio(portfolio) && metadata?.basic?.emoji)) && (
                      <Button
                        type="button"
                        variant="text"
                        onClick={() => {
                          setAvatarFile(null)
                          setAvatarPreview(basic.avatar || null)
                          if (!isHumanPortfolio(portfolio)) {
                            setSelectedEmoji(metadata?.basic?.emoji || null)
                          }
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

            {/* Description (preview + popup editor) */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <UIText as="label" className="block">
                  Description
                </UIText>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowDescriptionEditor(true)}
                  disabled={loading}
                >
                  <UIText>{description.trim().length > 0 ? 'Edit' : 'Add'}</UIText>
                </Button>
              </div>
              <UIText as="p" className="text-xs text-gray-500 mb-2">
                You can add relevant links (NOT LinkedIn!) This description helps us build the knowledge graph to find better opportunities for you.
              </UIText>
              {description.trim().length > 0 ? (
                <Card variant="subtle" padding="sm">
                  <UIText as="div" className="text-xs text-gray-500 mb-2">
                    Preview (truncated)
                  </UIText>
                  <Content className="whitespace-pre-wrap line-clamp-5">{description}</Content>
                </Card>
              ) : (
                <UIText as="p" className="text-xs text-gray-500">
                  Add a description with paragraphs (max 3000 characters).
                </UIText>
              )}
            </div>

            {/* Type Selection (projects and communities only; activities use Advanced) */}
            {(isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio)) && (
              <div>
                {isProjectPortfolio(portfolio) ? (
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
            )}

            {/* Visibility and Status (projects only; activities use Advanced) */}
            {isProjectPortfolio(portfolio) && (
              <>
                <div>
                  <UIText as="label" className="block mb-2">
                    Visibility
                  </UIText>
                  <div className="flex flex-wrap gap-2">
                    {(['public', 'private'] as PortfolioVisibility[]).map((v) => (
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
                    Private projects are only visible to you and will not appear in search or feeds.
                  </UIText>
                </div>
                <div className="mt-4">
                  <UIText as="label" className="block mb-2">
                    Status
                  </UIText>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'live', label: 'Live' },
                      { key: 'archived', label: 'Archived' },
                    ].map((option) => {
                      const selected = projectStatus === option.key
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() =>
                            setProjectStatus(selected ? '' : option.key)
                          }
                          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                            selected
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                          disabled={loading}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                  <UIText as="p" className="text-xs text-gray-500 mt-1">
                    Used to indicate whether this project is live or archived.
                  </UIText>
                </div>
              </>
            )}

            {/* Activity edit: same order as create — Host projects (or link for external), Date & time, Location, then Advanced */}
            {portfolio.type === 'activities' && (() => {
              const activityProps = (portfolio.metadata as any)?.properties || {}
              const isExternalActivity = activityProps.external === true
              const externalLink = (activityProps.external_link as string) || ''
              return (
              <>
                {!isExternalActivity && (
                <div>
                  <UIText as="label" className="block mb-2">
                    Hosts
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
                </div>
                )}

                {isExternalActivity && externalLink && (
                  <div>
                    <UIText as="label" className="block mb-2">
                      Event link
                    </UIText>
                    <ActivityLinkBadge url={externalLink} />
                  </div>
                )}

                {isExternalActivity && (
                  <div className="flex items-center gap-2 mt-4">
                    <input
                      type="checkbox"
                      id="creator_going_edit"
                      checked={creatorGoing}
                      onChange={(e) => setCreatorGoing(e.target.checked)}
                      disabled={loading}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <UIText as="label" htmlFor="creator_going_edit" className="cursor-pointer">
                      I&apos;m going to this event
                    </UIText>
                  </div>
                )}

                <div className="mt-4">
                  <UIText as="label" className="block mb-2">
                    Activity date &amp; time
                  </UIText>
                  <ActivityDateTimeField
                    value={activityValue}
                    onChange={setActivityValue}
                    portfolioTitle={name || basic.name}
                    hint="When set, the activity is Live during the scheduled period (and after start if there's no end time). After the end time it's no longer Live—you don't need to switch it manually."
                    defaultOpen={initialShowActivityPicker}
                  />
                </div>

                <div className="mt-4">
                  <UIText as="label" className="block mb-2">
                    Location
                  </UIText>
                  <ActivityLocationField
                    value={activityLocation}
                    onChange={setActivityLocation}
                    portfolioTitle={name || basic.name}
                    canSeeFullLocation
                    defaultOpen={initialShowLocationPicker}
                  />
                </div>

                {/* Advanced settings (activities): Category, Visibility, Live/Archive, Call to join — hidden for external */}
                {!isExternalActivity && (
                <div className="border border-gray-200 rounded-lg overflow-hidden mt-4">
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
                          {(['public', 'private'] as PortfolioVisibility[]).map((v) => (
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

                      {/* Live / Archive: only when no date & time — clear relationship to schedule */}
                      <div>
                        <UIText as="label" className="block mb-2">
                          Status (Live / Archived)
                        </UIText>
                        {activityValue?.start ? (
                          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                            <UIText className="text-gray-700">
                              You’ve set a date &amp; time, so status is automatic: the activity is Live during the scheduled period and no longer Live after the end time. No need to set Live/Archived here.
                            </UIText>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { key: 'in-progress', label: 'Live' },
                                { key: 'archived', label: 'Archived' },
                              ].map((option) => {
                                const selected = projectStatus === option.key
                                return (
                                  <button
                                    key={option.key}
                                    type="button"
                                    onClick={() =>
                                      setProjectStatus(selected ? '' : option.key)
                                    }
                                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                                      selected
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    }`}
                                    disabled={loading}
                                  >
                                    {option.label}
                                  </button>
                                )
                              })}
                            </div>
                            <UIText as="p" className="text-xs text-gray-500 mt-1">
                              When no date &amp; time is set, use this to mark whether the activity is currently live or archived.
                            </UIText>
                          </>
                        )}
                      </div>

                      {visibility !== 'private' && (
                        <div>
                          <UIText as="label" className="block mb-2">
                            Call to join
                          </UIText>
                          <UIText as="p" className="text-xs text-gray-500 mb-2">
                            Public activities show a call-to-join card so visitors can apply.
                          </UIText>
                          <div className="mt-2">
                            <Card variant="subtle" padding="sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <UIText as="h3" className="mb-1">
                                    Call to join preview
                                  </UIText>
                                  <Content className="mb-1">
                                    {callToJoinConfig?.description || 'Join this activity.'}
                                  </Content>
                                  <UIText className="text-gray-600 text-xs">
                                    {callToJoinConfig?.join_by
                                      ? `Join by: ${new Date(
                                          callToJoinConfig.join_by
                                        ).toLocaleString()}`
                                      : 'No join-by date: applications close when the activity ends or is archived.'}
                                  </UIText>
                                  <UIText className="text-gray-600 text-xs mt-1">
                                    {callToJoinConfig?.require_approval ?? true
                                      ? 'Requires approval'
                                      : 'Auto-join'}
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
                    </div>
                  )}
                </div>
                )}
              </>
            )
            })()}

            {/* Human portfolio settings */}
            {isHumanPortfolio(portfolio) && (
              <div className="mt-4 space-y-4">
                <div>
                  <UIText as="label" className="block mb-2">
                    City location
                  </UIText>
                  <div className="flex items-center gap-2">
                    <input
                      id="human-auto-city-location-enabled"
                      type="checkbox"
                      checked={humanAutoCityLocationEnabled}
                      onChange={(e) => setHumanAutoCityLocationEnabled(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      disabled={loading}
                    />
                    <UIText as="label" htmlFor="human-auto-city-location-enabled">
                      Share my city (derived from my IP address) on my human portfolio
                    </UIText>
                  </div>
                  <UIText as="p" className="text-xs text-gray-500 mt-1">
                    When this is on, we periodically update a coarse city/region location based on
                    your IP address and show it on your human portfolio. Turning this off stops
                    future updates and hides the city badge.
                  </UIText>
                </div>

                <div>
                  <UIText as="label" className="block mb-2">
                    Calendar availability
                  </UIText>
                  <UIText as="p" className="text-xs text-gray-500 mb-2">
                    Set when you’re generally available during the week. This helps us recommend
                    better activity opportunities.
                  </UIText>
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => {
                        const baseSchedule = hasAnyAvailability(availabilitySchedule)
                          ? availabilitySchedule
                          : createSuggestedAvailabilitySchedule()
                        setAvailabilityScheduleDraft(cloneAvailabilitySchedule(baseSchedule))
                        setShowAvailabilityModal(true)
                      }}
                      disabled={loading}
                    >
                      <AvailabilityPreviewCard schedule={availabilitySchedule} />
                    </button>
                  </div>
                </div>
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
    {isHumanPortfolio(portfolio) && showAvailabilityModal && (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
        <div
          className="bg-white rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <Card variant="default" padding="sm">
            <div>
              <div className="mb-4">
                <Title as="h3">Set your weekly availability</Title>
                <UIText as="p" className="text-xs text-gray-500 mt-1">
                  Choose which days you’re usually available and optional time ranges. Times use
                  your local timezone. This helps us recommend better activity opportunities.
                </UIText>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  {HUMAN_AVAILABILITY_DAYS.map((dayKey) => {
                    const draft = availabilityScheduleDraft || availabilitySchedule
                    const value = draft[dayKey] || { enabled: false }
                    const label = HUMAN_AVAILABILITY_DAY_LABELS[dayKey]
                    return (
                      <div key={dayKey} className="flex flex-col gap-1 border-b border-gray-100 pb-3 last:border-b-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              id={`availability-${dayKey}`}
                              type="checkbox"
                              checked={value.enabled}
                              onChange={(e) => {
                                const next = cloneAvailabilitySchedule(draft)
                                next[dayKey] = {
                                  ...(next[dayKey] || { enabled: false }),
                                  enabled: e.target.checked,
                                }
                                setAvailabilityScheduleDraft(next)
                              }}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <UIText as="label" htmlFor={`availability-${dayKey}`}>
                              {label}
                            </UIText>
                          </div>
                          <Button
                            type="button"
                            variant="text"
                            size="sm"
                            onClick={() => {
                              alert('Per-day custom time slots coming soon!')
                            }}
                          >
                            <UIText>Customize slots</UIText>
                          </Button>
                        </div>
                        {value.enabled && (
                          <div className="mt-1 flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                            <div className="flex items-center gap-2">
                              <UIText as="span" className="text-xs text-gray-500">
                                From
                              </UIText>
                              <input
                                type="time"
                                value={value.startTime || ''}
                                onChange={(e) => {
                                  const next = cloneAvailabilitySchedule(draft)
                                  const current = next[dayKey] || { enabled: true }
                                  next[dayKey] = {
                                    ...current,
                                    startTime: e.target.value || undefined,
                                  }
                                  setAvailabilityScheduleDraft(next)
                                }}
                                className="px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <UIText as="span" className="text-xs text-gray-500">
                                To
                              </UIText>
                              <input
                                type="time"
                                value={value.endTime || ''}
                                onChange={(e) => {
                                  const next = cloneAvailabilitySchedule(draft)
                                  const current = next[dayKey] || { enabled: true }
                                  next[dayKey] = {
                                    ...current,
                                    endTime: e.target.value || undefined,
                                  }
                                  setAvailabilityScheduleDraft(next)
                                }}
                                className="px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <UIText as="p" className="text-xs text-gray-500">
                    You can leave times empty for a day to indicate you’re flexible that day.
                  </UIText>
                  {availabilityValidationError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md">
                      <UIText>{availabilityValidationError}</UIText>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <AvailabilityPreviewCard schedule={availabilityScheduleDraft || availabilitySchedule} />
                  <div className="flex justify-between items-center">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        alert('Calendar connection coming soon!')
                      }}
                    >
                      <UIText>Connect calendars</UIText>
                    </Button>
                    <Button
                      type="button"
                      variant="text"
                      size="sm"
                      onClick={() => {
                        const cleared = createDefaultAvailabilitySchedule()
                        setAvailabilityScheduleDraft(cleared)
                      }}
                    >
                      <UIText>Clear all</UIText>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-between items-center gap-2 pb-[calc(var(--app-topnav-height)+env(safe-area-inset-bottom,0px)+16px)] md:pb-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAvailabilityScheduleDraft(null)
                    setShowAvailabilityModal(false)
                  }}
                >
                  <UIText>Cancel</UIText>
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!!availabilityValidationError}
                    onClick={() => {
                      if (availabilityScheduleDraft) {
                        setAvailabilitySchedule(cloneAvailabilitySchedule(availabilityScheduleDraft))
                      }
                      setAvailabilityScheduleDraft(null)
                      setShowAvailabilityModal(false)
                    }}
                  >
                    <UIText>Save</UIText>
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    )}
    {/* Host selector for activities (projects and communities) */}
    {portfolio.type === 'activities' && showHostSelector && (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl w-auto mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                <UIText className="text-gray-500">Loading projects...</UIText>
              ) : hostProjects.filter((p) => !hostProjectIds.includes(p.id)).length === 0 ? (
                <UIText className="text-gray-500 mb-4">No more projects to add, or you are not owner/manager of any.</UIText>
              ) : (
                <div className="grid grid-cols-3 gap-x-4 gap-y-6 mb-4">
                  {hostProjects
                    .filter((p) => !hostProjectIds.includes(p.id))
                    .map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        className="flex flex-col items-center gap-2 py-4 px-3 hover:opacity-80 transition-opacity"
                        onClick={() => {
                          setHostProjectIds((prev) => (prev.includes(project.id) ? prev : [...prev, project.id]))
                          setShowHostSelector(false)
                        }}
                      >
                        <StickerAvatar
                          src={project.avatar}
                          alt={project.name}
                          type="projects"
                          size={56}
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
              <UIText className="text-gray-500">Loading communities...</UIText>
            ) : hostCommunities.filter((c) => !hostCommunityIds.includes(c.id)).length === 0 ? (
              <UIText className="text-gray-500 mb-4">No more communities to add, or you are not owner/manager of any.</UIText>
            ) : (
              <div className="grid grid-cols-3 gap-x-4 gap-y-6 mb-4">
                {hostCommunities
                  .filter((c) => !hostCommunityIds.includes(c.id))
                  .map((community) => (
                    <button
                      key={community.id}
                      type="button"
                      className="flex flex-col items-center gap-2 py-4 px-3 hover:opacity-80 transition-opacity"
                      onClick={() => {
                        setHostCommunityIds((prev) => (prev.includes(community.id) ? prev : [...prev, community.id]))
                        setShowHostSelector(false)
                      }}
                    >
                      <StickerAvatar
                        src={community.avatar}
                        alt={community.name}
                        type="community"
                        size={56}
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

    {/* Call-to-join details popup for activities */}
    {portfolio.type === 'activities' && showCallToJoinModal && (
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
                  value={callToJoinConfig?.description || ''}
                  onChange={(e) =>
                    setCallToJoinConfig((prev) => ({
                      ...(prev || {
                        enabled: (visibility !== 'private'),
                        description: '',
                        join_by: null,
                        require_approval: true,
                        prompt: 'Why do you want to join this activity?',
                        roles: [
                          {
                            id: 'default-member',
                            label: 'Member',
                            activityRole: 'member',
                          },
                        ],
                        join_by_auto_managed: true,
                      }),
                      description: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <UIText as="label" className="block mb-1">
                  Join by (optional)
                </UIText>
                <input
                  type="datetime-local"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  value={
                    callToJoinConfig?.join_by
                      ? new Date(callToJoinConfig.join_by).toISOString().slice(0, 16)
                      : ''
                  }
                  onChange={(e) => {
                    const value = e.target.value
                    setCallToJoinConfig((prev) => ({
                      ...(prev || {
                        enabled: (visibility !== 'private'),
                        description: 'Join us!',
                        join_by: null,
                        require_approval: true,
                        prompt: 'Why do you want to join this activity?',
                        roles: [
                          {
                            id: 'default-member',
                            label: 'Member',
                            activityRole: 'member',
                          },
                        ],
                        join_by_auto_managed: true,
                      }),
                      join_by: value ? new Date(value).toISOString() : null,
                      join_by_auto_managed: value ? false : prev?.join_by_auto_managed ?? true,
                    }))
                  }}
                />
                <UIText as="p" className="text-xs text-gray-500 mt-1">
                  If left empty, applications close when the activity ends or is archived.
                </UIText>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="edit-activity-require-approval"
                  type="checkbox"
                  checked={callToJoinConfig?.require_approval ?? true}
                  onChange={(e) =>
                    setCallToJoinConfig((prev) => ({
                      ...(prev || {
                        enabled: (visibility !== 'private'),
                        description: 'Join us!',
                        join_by: null,
                        require_approval: true,
                        prompt: 'Why do you want to join this activity?',
                        roles: [
                          {
                            id: 'default-member',
                            label: 'Member',
                            activityRole: 'member',
                          },
                        ],
                        join_by_auto_managed: true,
                      }),
                      require_approval: e.target.checked,
                      // Clear prompt when turning off approval
                      prompt: e.target.checked ? prev?.prompt ?? null : null,
                    }))
                  }
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <UIText as="label" htmlFor="edit-activity-require-approval">
                  Require approval to join
                </UIText>
              </div>
              {(callToJoinConfig?.require_approval ?? true) && (
                <div>
                  <UIText as="label" className="block mb-1">
                    Prompt (optional)
                  </UIText>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    rows={3}
                    value={callToJoinConfig?.prompt || ''}
                    onChange={(e) =>
                      setCallToJoinConfig((prev) => ({
                        ...(prev || {
                          enabled: (visibility !== 'private'),
                          description: 'Join us!',
                          join_by: null,
                          require_approval: true,
                          prompt: 'Why do you want to join this activity?',
                          roles: [
                            { id: 'default-member', label: 'Member', activityRole: 'member' },
                          ],
                          join_by_auto_managed: true,
                        }),
                        prompt: e.target.value,
                      }))
                    }
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

