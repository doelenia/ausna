'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { OnboardingStatus } from '@/app/onboarding/actions'
import {
  getOnboardingStatusForCurrentUser,
  agreeToCurrentLegal,
  setJoinCommunitySeen,
  getMyHumanPortfolioForOnboarding,
  saveOnboardingProfile,
  saveOnboardingAvailabilitySchedule,
} from '@/app/onboarding/actions'
import { applyToCommunityJoin } from '@/app/portfolio/[type]/[id]/actions'
import type { HumanAvailabilitySchedule } from '@/types/portfolio'
import { Title, Content, UIText, Button, Card, UIButtonText, UserAvatar } from '@/components/ui'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { DoorOpen } from 'lucide-react'
import Link from 'next/link'

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

function hasAnyAvailabilityEnabled(schedule: HumanAvailabilitySchedule | null | undefined): boolean {
  if (!schedule) return false
  return HUMAN_AVAILABILITY_DAYS.some((day) => schedule[day]?.enabled === true)
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

interface OnboardingGateProps {
  initialStatus: OnboardingStatus
}

export function OnboardingGate({ initialStatus }: OnboardingGateProps) {
  const [status, setStatus] = useState<OnboardingStatus>(initialStatus)
  const [dismissed, setDismissed] = useState(false)
  const [sawIncompleteOnce, setSawIncompleteOnce] = useState(
    initialStatus.incompleteStepIds.length > 0
  )
  const refetch = useCallback(async () => {
    const next = await getOnboardingStatusForCurrentUser()
    if (next) setStatus(next)
  }, [])

  const incompleteStepIds = status.incompleteStepIds
  const showModal = incompleteStepIds.length > 0

  useEffect(() => {
    if (status.incompleteStepIds.length > 0) {
      setSawIncompleteOnce(true)
    }
  }, [status.incompleteStepIds.length])

  const allSteps = status.steps
  const totalSteps = allSteps.length
  const currentStepId = incompleteStepIds[0] ?? null
  const currentStepIndexInAll = currentStepId
    ? allSteps.findIndex((s) => s.id === currentStepId)
    : totalSteps - 1
  const currentStepNumber = currentStepIndexInAll >= 0 ? currentStepIndexInAll + 1 : totalSteps
  const completedCount = allSteps.filter((s) => s.complete).length
  const progress =
    totalSteps > 0 ? Math.min(1, Math.max(0, completedCount / totalSteps)) : 1

  const isComplete = incompleteStepIds.length === 0
  const shouldShowCompletion = isComplete && sawIncompleteOnce && !dismissed

  if (!showModal && !shouldShowCompletion) return null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-50" aria-modal="true" role="dialog">
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {shouldShowCompletion ? (
          <div className="max-w-xl mx-auto">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <UIText className="text-gray-700">
                  Step {totalSteps} of {totalSteps}
                </UIText>
                <UIText className="text-gray-500">
                  {totalSteps} of {totalSteps} completed
                </UIText>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div className="pt-8 mb-6 text-center">
              <Title as="h1">Welcome to Ausna!</Title>
            </div>
            <div className="flex flex-col items-center justify-center gap-6">
              <DoorOpen className="w-20 h-20 text-gray-300" strokeWidth={1.5} />
              <Button
                variant="primary"
                onClick={() => setDismissed(true)}
              >
                <UIText>Continue</UIText>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="max-w-xl mx-auto mb-4">
              <div className="flex items-center justify-between mb-2">
                <UIText className="text-gray-700">
                  Step {currentStepNumber} of {totalSteps}
                </UIText>
                <UIText className="text-gray-500">
                  {completedCount} of {totalSteps} completed
                </UIText>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
            {currentStepId === 'legal' && (
              <OnboardingLegalStep onComplete={refetch} />
            )}
            {currentStepId === 'profile' && (
              <OnboardingProfileStep onComplete={refetch} />
            )}
            {currentStepId === 'availabilities' && (
              <OnboardingAvailabilitiesStep onComplete={refetch} />
            )}
            {currentStepId === 'join_community' && (
              <OnboardingJoinCommunityStep onComplete={refetch} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OnboardingLegalStep({ onComplete }: { onComplete: () => void }) {
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreeTerms || !agreePrivacy) {
      setError('Please agree to both Terms & Conditions and Privacy Policy.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await agreeToCurrentLegal()
      if (!result.success) {
        setError(result.error ?? 'Failed to record agreement.')
        return
      }
      onComplete()
    } catch (err) {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card variant="spacious" className="max-w-xl mx-auto">
      <form onSubmit={handleSubmit}>
        <Title as="h1" className="mb-2">
          Terms &amp; Privacy
        </Title>
        <Content className="mb-4">
          Please read and agree to our Terms &amp; Conditions and Privacy Policy to continue.
        </Content>
        <div className="space-y-3 mb-6">
        <div className="flex items-start gap-2">
          <input
            id="agree-terms"
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="agree-terms" className="flex-1">
            <UIText>
              I have read and agree to the{' '}
              <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                Terms &amp; Conditions
              </Link>
            </UIText>
          </label>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="agree-privacy"
            type="checkbox"
            checked={agreePrivacy}
            onChange={(e) => setAgreePrivacy(e.target.checked)}
            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="agree-privacy" className="flex-1">
            <UIText>
              I have read and agree to the{' '}
              <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                Privacy Policy
              </Link>
            </UIText>
          </label>
        </div>
      </div>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <UIText className="text-red-700">{error}</UIText>
          </div>
        )}
        <Button type="submit" variant="primary" disabled={loading}>
          <UIText>{loading ? 'Saving...' : 'I agree'}</UIText>
        </Button>
      </form>
    </Card>
  )
}

function OnboardingProfileStep({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [initialAvatarUrl, setInitialAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMyHumanPortfolioForOnboarding().then((res) => {
      if (cancelled || !res.success || !res.portfolio) return
      const meta = res.portfolio.metadata
      const basic = meta?.basic
      setName((basic?.name as string) ?? '')
      setDescription((basic?.description as string) ?? '')
      const av = (basic?.avatar as string) ?? ''
      if (av && typeof av === 'string') setInitialAvatarUrl(av)
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      setAvatarPreview(URL.createObjectURL(file))
    } else {
      setAvatarFile(null)
      setAvatarPreview(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedDesc = description.trim()
    if (!trimmedName || !trimmedDesc) {
      setError('Name and description are required.')
      return
    }
    const hasAvatar = !!(avatarFile || avatarPreview || initialAvatarUrl)
    if (!hasAvatar) {
      setError('Please add a profile photo (avatar).')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.set('name', trimmedName)
      formData.set('description', trimmedDesc)
      if (avatarFile) formData.set('avatar', avatarFile)
      const result = await saveOnboardingProfile(formData)
      if (!result.success) {
        setError(result.error ?? 'Failed to save profile.')
        setLoading(false)
        return
      }
      onComplete()
    } catch (err) {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  if (!loaded) {
    return (
      <Card variant="spacious" className="max-w-xl mx-auto">
        <UIText>Loading...</UIText>
      </Card>
    )
  }

  return (
    <Card variant="spacious" className="max-w-xl mx-auto">
      <Title as="h1" className="mb-2">
        Complete your profile
      </Title>
      <Content className="mb-4">
        Add your name, a short description, and a profile photo.
      </Content>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <UIText as="label" className="block mb-1">
            Name
          </UIText>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            required
          />
        </div>
        <div>
          <UIText as="label" className="block mb-1">
            Description
          </UIText>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            required
          />
        </div>
        <div>
          <UIText as="label" className="block mb-1">
            Profile photo
          </UIText>
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="w-full text-gray-600 file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700"
          />
          {(avatarPreview || initialAvatarUrl) && (
            <img
              src={avatarPreview ?? initialAvatarUrl ?? ''}
              alt="Preview"
              className="mt-2 h-24 w-24 rounded-full object-cover border border-gray-200"
            />
          )}
        </div>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <UIText className="text-red-700">{error}</UIText>
          </div>
        )}
        <Button type="submit" variant="primary" disabled={loading}>
          <UIText>{loading ? 'Saving...' : 'Save'}</UIText>
        </Button>
      </form>
    </Card>
  )
}

function OnboardingAvailabilitiesStep({ onComplete }: { onComplete: () => void }) {
  const [schedule, setSchedule] = useState<HumanAvailabilitySchedule>(createSuggestedAvailabilitySchedule())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const availabilityValidationError = getAvailabilityValidationError(schedule)

  useEffect(() => {
    let cancelled = false
    getMyHumanPortfolioForOnboarding().then((res) => {
      if (cancelled || !res.success || !res.portfolio) return
      const props = res.portfolio.metadata?.properties
      const existing = props?.availability_schedule
      if (existing && typeof existing === 'object' && hasAnyAvailabilityEnabled(existing as any)) {
        setSchedule(cloneAvailabilitySchedule(existing as HumanAvailabilitySchedule))
      } else {
        setSchedule(createSuggestedAvailabilitySchedule())
      }
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (availabilityValidationError) {
      setError(availabilityValidationError)
      return
    }
    if (!hasAnyAvailabilityEnabled(schedule)) {
      setError('Please enable at least one day.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await saveOnboardingAvailabilitySchedule(JSON.stringify(schedule))
      if (!result.success) {
        setError(result.error ?? 'Failed to save.')
        setLoading(false)
        return
      }
      onComplete()
    } catch (err) {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  if (!loaded) {
    return (
      <Card variant="spacious" className="max-w-xl mx-auto">
        <UIText>Loading...</UIText>
      </Card>
    )
  }

  return (
    <Card variant="spacious" className="max-w-xl mx-auto">
      <Title as="h1" className="mb-2">
        Set your availability
      </Title>
      <Content className="mb-4">
        Start with our suggested schedule and adjust it as needed.
      </Content>
      <form onSubmit={handleSubmit} className="space-y-3">
        {HUMAN_AVAILABILITY_DAYS.map((dayKey) => {
          const value = schedule[dayKey] || { enabled: false }
          const label = HUMAN_AVAILABILITY_DAY_LABELS[dayKey]
          return (
            <div key={dayKey} className="flex flex-col gap-1 border-b border-gray-100 pb-3 last:border-b-0">
              <div className="flex items-center gap-2">
                <input
                  id={`avail-${dayKey}`}
                  type="checkbox"
                  checked={value.enabled}
                  onChange={(e) => {
                    const next = cloneAvailabilitySchedule(schedule)
                    next[dayKey] = {
                      ...(next[dayKey] || { enabled: false }),
                      enabled: e.target.checked,
                    }
                    setSchedule(next)
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <UIText as="label" htmlFor={`avail-${dayKey}`}>
                  {label}
                </UIText>
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
                        const next = cloneAvailabilitySchedule(schedule)
                        const current = next[dayKey] || { enabled: true }
                        next[dayKey] = {
                          ...current,
                          startTime: e.target.value || undefined,
                        }
                        setSchedule(next)
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
                        const next = cloneAvailabilitySchedule(schedule)
                        const current = next[dayKey] || { enabled: true }
                        next[dayKey] = {
                          ...current,
                          endTime: e.target.value || undefined,
                        }
                        setSchedule(next)
                      }}
                      className="px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <UIText className="text-red-700">{error}</UIText>
          </div>
        )}
        <Button type="submit" variant="primary" disabled={loading}>
          <UIText>{loading ? 'Saving...' : 'Save'}</UIText>
        </Button>
      </form>
    </Card>
  )
}

interface CommunitySearchResult {
  id: string
  type: string
  name: string
  description?: string
  avatar?: string | null
  emoji?: string | null
  username?: string | null
  user_id?: string
}

function OnboardingJoinCommunityStep({ onComplete }: { onComplete: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CommunitySearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [promptAnswer, setPromptAnswer] = useState('')
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearching(true)
      fetch(`/api/portfolios/search?q=${encodeURIComponent(query.trim())}&type=community&limit=20`)
        .then((res) => res.json())
        .then((data) => {
          const list: CommunitySearchResult[] = (data.results ?? [])
            .filter((p: any) => p.type === 'community')
            .map((p: any) => ({
              id: p.id,
              type: p.type,
              name: p.name,
              description: p.description,
              avatar: p.avatar ?? null,
              emoji: p.emoji ?? null,
              username: p.username ?? null,
              user_id: p.user_id,
            }))
          setResults(list)
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
      debounceRef.current = null
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId || !promptAnswer.trim()) {
      setFeedback('Please provide an answer.')
      return
    }
    setSubmitting(true)
    setFeedback(null)
    try {
      const result = await applyToCommunityJoin({
        portfolioId: selectedId,
        promptAnswer: promptAnswer.trim(),
      })
      if (!result.success) {
        setFeedback(result.error ?? 'Failed to submit.')
        setSubmitting(false)
        return
      }
      const flagResult = await setJoinCommunitySeen()
      if (!flagResult.success) {
        setFeedback(flagResult.error ?? 'Failed to update.')
        setSubmitting(false)
        return
      }
      setShowJoinModal(false)
      onComplete()
    } catch (err) {
      setFeedback('An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSkip = async () => {
    setSubmitting(true)
    setFeedback(null)
    try {
      const result = await setJoinCommunitySeen()
      if (!result.success) {
        setFeedback(result.error ?? 'Failed to skip.')
        setSubmitting(false)
        return
      }
      onComplete()
    } catch (err) {
      setFeedback('An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedCommunity =
    results.find((r) => r.id === selectedId) ?? (selectedId ? { name: 'Community', id: selectedId } : null)

  return (
    <>
      <Card variant="spacious" className="max-w-xl mx-auto">
        <Title as="h1" className="mb-2">
          Join a community
        </Title>
        <Content className="mb-4">
          Search for a community to join, or skip this step for now.
        </Content>
        <div className="space-y-4">
          <div>
            <UIText as="label" className="block mb-1">
              Search by name or slug
            </UIText>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              autoComplete="off"
            />
          </div>
          {searching && <UIText className="text-gray-500">Searching...</UIText>}
          {results.length > 0 && (
            <ul className="border border-gray-200 rounded-md max-h-64 overflow-auto divide-y divide-gray-100">
              {results.map((r) => (
                <li key={r.id} className="px-3 py-2 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    {/* Left: avatar + text block (similar to SearchResultItem for communities) */}
                    <div className="flex-1 flex items-start gap-3 min-w-0">
                      <div className="flex-shrink-0">
                        {r.type === 'human' ? (
                          <UserAvatar
                            userId={r.user_id || ''}
                            name={r.name}
                            avatar={r.avatar || undefined}
                            size={40}
                            showLink={false}
                          />
                        ) : (
                          <StickerAvatar
                            src={r.avatar ?? undefined}
                            alt={r.name}
                            type="community"
                            size={40}
                            emoji={r.emoji ?? undefined}
                            name={r.name}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-baseline gap-2 mb-0.5 min-w-0">
                          <Content className="truncate min-w-0">{r.name}</Content>
                          <UIButtonText className="text-gray-500 flex-shrink-0">Community</UIButtonText>
                        </div>
                        {r.description && (
                          <div className="min-w-0 overflow-hidden">
                            <UIText className="text-gray-600 truncate">{r.description}</UIText>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Right: Apply button */}
                    <div className="flex-shrink-0">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setSelectedId(r.id)
                          setShowJoinModal(true)
                          setPromptAnswer('')
                          setFeedback(null)
                        }}
                      >
                        <UIText>Apply</UIText>
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {feedback && !showJoinModal && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <UIText className="text-red-700">{feedback}</UIText>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleSkip} disabled={submitting}>
              <UIText>Skip for now</UIText>
            </Button>
          </div>
        </div>
      </Card>

      {showJoinModal && selectedId && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/40 p-4">
          <Card variant="spacious" className="w-full max-w-md">
            <Title as="h2" className="mb-2">
              Request to join {selectedCommunity?.name ?? 'community'}
            </Title>
            <Content className="mb-3">
              Please provide proofs of your membership.
            </Content>
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <UIText as="label" className="block mb-1">
                  Your answer
                </UIText>
                <textarea
                  value={promptAnswer}
                  onChange={(e) => setPromptAnswer(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  required
                />
              </div>
              {feedback && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <UIText className="text-red-700">{feedback}</UIText>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowJoinModal(false)}
                  disabled={submitting}
                >
                  <UIText>Cancel</UIText>
                </Button>
                <Button type="submit" variant="primary" disabled={submitting}>
                  <UIText>{submitting ? 'Submitting...' : 'Submit'}</UIText>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </>
  )
}
