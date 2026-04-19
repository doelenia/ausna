'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { OnboardingStatus } from '@/app/onboarding/actions'
import {
  getOnboardingStatusForCurrentUser,
  agreeToCurrentLegal,
  setJoinCommunitySeen,
  getMyHumanPortfolioForOnboarding,
  saveOnboardingProfile,
  completeOpenCallsOnboarding,
  generateOnboardingOpenCallDraft,
} from '@/app/onboarding/actions'
import { applyToActivityCallToJoin } from '@/app/portfolio/[idOrSlug]/actions'
import { Title, Subtitle, Content, UIText, Button, Card, UIButtonText, UserAvatar } from '@/components/ui'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { DoorOpen, Pencil } from 'lucide-react'
import Link from 'next/link'
import {
  addDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  format,
  isBefore,
  startOfDay,
} from 'date-fns'
import { prepareProfileAvatarFile } from '@/lib/utils/profile-avatar-client'

const OPEN_CALL_NEVER_ENDS_WARNING = 'Setting never ends might lower the priority for broadcasting.'

/** Prevents duplicate AI draft requests when React Strict Mode double-mounts the onboarding step. */
let onboardingOpenCallAiDraftRequestStarted = false

function formatOpenCallEndDateSummary(openCallEndDate: Date | null): string {
  if (openCallEndDate === null) return 'Never ends'
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const end = new Date(openCallEndDate)
  end.setHours(0, 0, 0, 0)
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft <= 0) return 'Ended'
  if (daysLeft === 1) return 'Ends in 1 day'
  if (daysLeft < 30) return `Ends in ${daysLeft} days`
  return `Ends on ${end.toLocaleDateString()}`
}
const HUMAN_DESCRIPTION_PLACEHOLDER =
  'Student into climate tech, design, and community projects. Also love cafes, creative ideas, and meeting people. Currently working on hackathons and startup-related projects in Tokyo. Looking for collaborators!'

interface OnboardingGateProps {
  initialStatus: OnboardingStatus
}

export function OnboardingGate({ initialStatus }: OnboardingGateProps) {
  const pathname = usePathname()
  const isLegalPage = pathname?.startsWith('/legal/')
  const router = useRouter()

  if (isLegalPage) {
    return null
  }

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

  const currentStepId = incompleteStepIds[0] ?? null

  const isComplete = incompleteStepIds.length === 0
  const shouldShowCompletion = isComplete && sawIncompleteOnce && !dismissed

  if (!showModal && !shouldShowCompletion) return null

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-50" aria-modal="true" role="dialog">
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {shouldShowCompletion ? (
          <div className="max-w-xl mx-auto">
            <div className="pt-8 mb-6 text-center">
              <Title as="h1">Welcome to Ausna!</Title>
            </div>
            <div className="flex flex-col items-center justify-center gap-6">
              <DoorOpen className="w-20 h-20 text-gray-300" strokeWidth={1.5} />
              <Button
                variant="primary"
                onClick={() => {
                  // Close immediately, then refresh server-rendered content to reflect onboarding changes.
                  setDismissed(true)
                  router.refresh()
                }}
              >
                <UIText>Continue</UIText>
              </Button>
            </div>
          </div>
        ) : (
          <>
            {currentStepId === 'legal' && (
              <OnboardingLegalStep onComplete={refetch} />
            )}
            {currentStepId === 'profile' && (
              <OnboardingProfileStep onComplete={refetch} />
            )}
            {currentStepId === 'join_community' && (
              <OnboardingJoinCommunityStep onComplete={refetch} />
            )}
            {currentStepId === 'open_calls' && (
              <OnboardingOpenCallsStep onComplete={refetch} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function OnboardingOpenCallsStep({ onComplete }: { onComplete: () => void }) {
  const [title, setTitle] = useState('Coffee chat with me! Online and In-person are welcomed!')
  const [description, setDescription] = useState(
    'Hi, I would love to talk with amazing people. Let me know if you wanna have a coffee chat wherever you are and whenever you need.'
  )
  const [openCallEndDate, setOpenCallEndDate] = useState<Date | null>(null)
  const [showEndDatePopup, setShowEndDatePopup] = useState(false)
  const [showEditOpenCallModal, setShowEditOpenCallModal] = useState(false)
  const [openCallCalendarMonth, setOpenCallCalendarMonth] = useState<Date>(() => startOfDay(new Date()))
  const [loading, setLoading] = useState(false)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerateDraft = useCallback(async () => {
    setGeneratingDraft(true)
    setError(null)
    try {
      const result = await generateOnboardingOpenCallDraft()
      if (!result.success) {
        setError(result.error ?? 'Failed to generate draft.')
        return
      }
      if (result.title) setTitle(result.title)
      if (result.description) setDescription(result.description)
    } catch (_err) {
      setError('An unexpected error occurred.')
    } finally {
      setGeneratingDraft(false)
    }
  }, [])

  useEffect(() => {
    if (onboardingOpenCallAiDraftRequestStarted) return
    onboardingOpenCallAiDraftRequestStarted = true
    void handleGenerateDraft()
  }, [handleGenerateDraft])

  const openEditModal = () => {
    if (generatingDraft) return
    setShowEditOpenCallModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await completeOpenCallsOnboarding({
        title,
        description,
        endDate: openCallEndDate ? openCallEndDate.toISOString() : null,
      })

      if (!result.success) {
        setError(result.error ?? 'Failed to save open call.')
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

  return (
    <Card variant="spacious" className="max-w-xl mx-auto">
      <Title as="h1" className="mb-2">
        Setup your open calls
      </Title>
      <Content className="mb-4">
        Open calls help your friends help or engage with you in the most meaningful ways. You can add or edit open calls
        later.
      </Content>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Content className="mb-1">
          We'll suggest a title and description from your profile. Everything below is yours to change.
        </Content>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Subtitle as="h2" className="mb-0">
            Your open call
          </Subtitle>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={generatingDraft}
            onClick={openEditModal}
            className="inline-flex items-center gap-1.5"
          >
            <Pencil className="w-4 h-4 shrink-0 text-gray-600" aria-hidden />
            <UIText>Edit</UIText>
          </Button>
        </div>

        <div
          role="button"
          tabIndex={generatingDraft ? -1 : 0}
          onClick={openEditModal}
          onKeyDown={(e) => {
            if (generatingDraft) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openEditModal()
            }
          }}
          className={`rounded-xl border-2 border-orange-500 bg-white overflow-hidden text-left transition-shadow ${
            generatingDraft
              ? 'cursor-wait opacity-90'
              : 'cursor-pointer hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2'
          }`}
          aria-label="Edit open call draft"
        >
          {generatingDraft ? (
            <div className="px-4 py-8">
              <UIText className="text-gray-600 text-center block">Creating your personalized draft…</UIText>
            </div>
          ) : (
            <>
              <div className="px-4 pt-4 pb-3">
                <Title as="h3" className="mb-2">
                  {title.trim() || 'Open call title'}
                </Title>
                <Content className="whitespace-pre-wrap">
                  {description.trim() || 'Tap to add a description for your open call.'}
                </Content>
              </div>
              <div className="px-4 py-3 border-t border-orange-100 bg-orange-50/40">
                <UIText as="span" className="block text-sm text-gray-600 mb-0.5">
                  End date
                </UIText>
                <Content className="mb-0">{formatOpenCallEndDateSummary(openCallEndDate)}</Content>
              </div>
            </>
          )}
        </div>

        {showEditOpenCallModal && (
          <div
            className="fixed inset-0 z-[102] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setShowEditOpenCallModal(false)}
          >
            <div className="w-full max-w-lg max-h-[min(90vh,720px)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <Card variant="spacious" className="shadow-xl">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <Title as="h2" className="mb-0">
                    Edit your open call
                  </Title>
                  <Button type="button" variant="text" onClick={() => setShowEditOpenCallModal(false)}>
                    <UIText>Close</UIText>
                  </Button>
                </div>
                <UIText className="text-gray-600 block mb-4">
                  Change the title and description here. Use the end date control if you want this open call to stop on a
                  specific day.
                </UIText>
                <div className="rounded-xl border-2 border-orange-500 bg-white overflow-hidden mb-4">
                  <div className="px-4 pt-4 pb-3">
                    <textarea
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Open call title"
                      rows={2}
                      className="w-full resize-none bg-transparent outline-none text-gray-900 placeholder:text-gray-400 text-xl font-normal"
                      required
                    />
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe your open call..."
                      rows={4}
                      className="mt-3 w-full resize-none bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
                      required
                    />
                  </div>
                  <div className="px-4 py-3 border-t border-orange-100 bg-orange-50/40">
                    <div>
                      <UIText as="label" className="block text-sm font-medium text-gray-700 mb-1">
                        End date
                      </UIText>
                      <button
                        type="button"
                        onClick={() => setShowEndDatePopup(true)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 text-left"
                      >
                        <span className="text-gray-900">{formatOpenCallEndDateSummary(openCallEndDate)}</span>
                        <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {openCallEndDate === null && (
                        <UIText as="p" className="mt-1.5 text-xs text-amber-700">
                          {OPEN_CALL_NEVER_ENDS_WARNING}
                        </UIText>
                      )}
                    </div>
                  </div>
                </div>
                <Button type="button" variant="primary" onClick={() => setShowEditOpenCallModal(false)}>
                  <UIText>Done editing</UIText>
                </Button>
              </Card>
            </div>
          </div>
        )}

        {showEndDatePopup && (
          <div
            className="fixed inset-0 z-[103] flex items-center justify-center bg-black bg-opacity-40"
            onClick={() => setShowEndDatePopup(false)}
          >
            <div
              className="bg-white rounded-xl shadow-lg w-full max-w-sm mx-4 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <UIText as="h3" className="font-medium text-gray-900 mb-3">
                Set end date
              </UIText>
              <div className="space-y-3">
                {openCallEndDate === null ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="w-full px-3 py-2 rounded-lg text-sm text-left bg-amber-100 text-amber-900 border border-amber-300"
                    >
                      Never ends (selected)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = addDays(startOfDay(new Date()), 7)
                        setOpenCallEndDate(d)
                        setOpenCallCalendarMonth(d)
                      }}
                      className="w-full px-3 py-2 rounded-lg text-sm text-left bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      End in X days
                    </button>
                    <UIText as="p" className="text-xs text-amber-700">
                      {OPEN_CALL_NEVER_ENDS_WARNING}
                    </UIText>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const today = startOfDay(new Date())
                      const end = startOfDay(openCallEndDate)
                      const daysVal = Math.max(
                        1,
                        Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                      )
                      return (
                        <div className="flex items-center gap-2">
                          <UIText as="span" className="text-sm text-gray-700">
                            End in
                          </UIText>
                          <input
                            type="number"
                            min={1}
                            value={daysVal}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10)
                              if (!Number.isNaN(n) && n >= 1) {
                                const d = addDays(startOfDay(new Date()), n)
                                setOpenCallEndDate(d)
                                setOpenCallCalendarMonth(d)
                              }
                            }}
                            className="w-16 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center"
                          />
                          <UIText as="span" className="text-sm text-gray-700">
                            day{daysVal !== 1 ? 's' : ''}
                          </UIText>
                        </div>
                      )
                    })()}

                    {(() => {
                      const monthStart = startOfMonth(openCallCalendarMonth)
                      const monthEnd = endOfMonth(monthStart)
                      const calendarStart = startOfWeek(monthStart)
                      const calendarEnd = endOfWeek(monthEnd)
                      const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })
                      const today = startOfDay(new Date())
                      return (
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-2">
                            <button
                              type="button"
                              onClick={() => setOpenCallCalendarMonth(addMonths(openCallCalendarMonth, -1))}
                              className="p-1 rounded hover:bg-gray-100 text-gray-600"
                              aria-label="Previous month"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                              </svg>
                            </button>
                            <UIText as="span" className="text-sm font-medium text-gray-900">
                              {format(openCallCalendarMonth, 'MMMM yyyy')}
                            </UIText>
                            <button
                              type="button"
                              onClick={() => setOpenCallCalendarMonth(addMonths(openCallCalendarMonth, 1))}
                              className="p-1 rounded hover:bg-gray-100 text-gray-600"
                              aria-label="Next month"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </div>
                          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                              <div key={d} className="py-1 text-gray-500 font-medium">
                                {d}
                              </div>
                            ))}
                            {days.map((day) => {
                              const isPast = isBefore(day, today)
                              const isSelected = openCallEndDate && isSameDay(day, openCallEndDate)
                              const isCurrentMonth = isSameMonth(day, monthStart)
                              return (
                                <button
                                  key={day.toISOString()}
                                  type="button"
                                  disabled={isPast}
                                  onClick={() => {
                                    if (isPast) return
                                    setOpenCallEndDate(day)
                                  }}
                                  className={`p-1.5 rounded text-sm ${
                                    isPast
                                      ? 'text-gray-300 cursor-not-allowed'
                                      : isSelected
                                        ? 'bg-blue-600 text-white'
                                        : isCurrentMonth
                                          ? 'text-gray-900 hover:bg-gray-100'
                                          : 'text-gray-400 hover:bg-gray-50'
                                  }`}
                                >
                                  {format(day, 'd')}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}

                    <button
                      type="button"
                      onClick={() => setOpenCallEndDate(null)}
                      className="w-full px-3 py-2 rounded-lg text-sm text-left bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Never ends
                    </button>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => setShowEndDatePopup(false)}>
                  <UIText>Cancel</UIText>
                </Button>
                <Button variant="primary" onClick={() => setShowEndDatePopup(false)}>
                  <UIText>Done</UIText>
                </Button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <UIText className="text-red-700">{error}</UIText>
          </div>
        )}
        <Button type="submit" variant="primary" disabled={loading}>
          <UIText>{loading ? 'Saving...' : 'Finish onboarding'}</UIText>
        </Button>
      </form>
    </Card>
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
  const [starterResources, setStarterResources] = useState<Array<{ url: string; caption: string }>>([
    { url: '', caption: '' },
  ])
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [initialAvatarUrl, setInitialAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [avatarPreparing, setAvatarPreparing] = useState(false)
  const avatarBlobUrlRef = useRef<string | null>(null)

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

  useEffect(() => {
    return () => {
      if (avatarBlobUrlRef.current) {
        URL.revokeObjectURL(avatarBlobUrlRef.current)
        avatarBlobUrlRef.current = null
      }
    }
  }, [])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      setAvatarFile(null)
      setAvatarPreview(initialAvatarUrl)
      if (avatarBlobUrlRef.current) {
        URL.revokeObjectURL(avatarBlobUrlRef.current)
        avatarBlobUrlRef.current = null
      }
      return
    }

    if (
      !file.type.startsWith('image/') &&
      !file.name.toLowerCase().endsWith('.heic') &&
      !file.name.toLowerCase().endsWith('.heif')
    ) {
      setError('Please select an image file.')
      e.target.value = ''
      return
    }

    setError(null)
    setAvatarPreparing(true)
    try {
      const prepared = await prepareProfileAvatarFile(file)
      if (avatarBlobUrlRef.current) {
        URL.revokeObjectURL(avatarBlobUrlRef.current)
      }
      const url = URL.createObjectURL(prepared)
      avatarBlobUrlRef.current = url
      setAvatarFile(prepared)
      setAvatarPreview(url)
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Could not process this image. Try another photo.'
      setError(msg)
      setAvatarFile(null)
      setAvatarPreview(initialAvatarUrl)
      if (avatarBlobUrlRef.current) {
        URL.revokeObjectURL(avatarBlobUrlRef.current)
        avatarBlobUrlRef.current = null
      }
      e.target.value = ''
    } finally {
      setAvatarPreparing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedDesc = description.trim()
    if (!trimmedName) {
      setError('Name is required.')
      return
    }
    if (!trimmedDesc) {
      setError('Description is required.')
      return
    }
    const hasAvatar = !!(avatarFile || avatarPreview || initialAvatarUrl)
    if (!hasAvatar) {
      setError('Please add a profile photo.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.set('name', trimmedName)
      formData.set('description', trimmedDesc)
      formData.set(
        'starter_resources',
        JSON.stringify(
          starterResources.map((r) => ({
            url: r.url.trim(),
            caption: r.caption.trim(),
          }))
        )
      )
      if (avatarFile) formData.set('avatar', avatarFile)
      const result = await saveOnboardingProfile(formData)
      if (!result.success) {
        setError(result.error ?? 'Failed to save profile.')
        setLoading(false)
        return
      }
      onComplete()
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.'
      setError(msg)
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
        Add your name, a short description, and profile photo to continue. Fields marked with{' '}
        <span className="text-danger-600" aria-hidden="true">
          *
        </span>{' '}
        are required.
      </Content>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <UIText as="label" className="block mb-1">
            Profile photo <span className="text-danger-600" aria-hidden="true">*</span>
          </UIText>
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            disabled={avatarPreparing}
            className="w-full text-gray-600 file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 disabled:opacity-60"
          />
          {(avatarPreview || initialAvatarUrl) && (
            <img
              src={avatarPreview ?? initialAvatarUrl ?? ''}
              alt="Preview"
              className="mt-2 h-24 w-24 rounded-full object-cover border border-gray-200"
            />
          )}
        </div>
        <div>
          <UIText as="label" className="block mb-1">
            Name <span className="text-danger-600" aria-hidden="true">*</span>
          </UIText>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            required
            aria-required="true"
          />
        </div>
        <div>
          <UIText as="label" className="block mb-1">
            Description <span className="text-danger-600" aria-hidden="true">*</span>
          </UIText>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={HUMAN_DESCRIPTION_PLACEHOLDER}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            required
            aria-required="true"
          />
        </div>

        <Card variant="subtle" padding="sm">
          <div className="space-y-3">
            <div>
              <Subtitle as="h2" className="mb-1">
                Resources (optional)
              </Subtitle>
              <UIText className="text-gray-600 block">
                Drop links that help people connect with you. Add a short caption if you want to give context.
              </UIText>
            </div>

            <div className="space-y-2">
              {starterResources.map((row, idx) => (
                <div key={idx} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                  <div>
                    <UIText as="label" className="block mb-1">
                      Link
                    </UIText>
                    <input
                      type="url"
                      inputMode="url"
                      value={row.url}
                      onChange={(e) =>
                        setStarterResources((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, url: e.target.value } : r))
                        )
                      }
                      placeholder="https://..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <UIText as="label" className="block mb-1">
                      Caption
                    </UIText>
                    <input
                      type="text"
                      value={row.caption}
                      onChange={(e) =>
                        setStarterResources((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, caption: e.target.value } : r))
                        )
                      }
                      placeholder="e.g. LinkedIn, Instagram, personal website"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>

                  {starterResources.length > 1 && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="text"
                        size="sm"
                        onClick={() => setStarterResources((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <UIText>Remove</UIText>
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-start">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setStarterResources((prev) => [...prev, { url: '', caption: '' }])}
              >
                <UIText>Add another</UIText>
              </Button>
            </div>
          </div>
        </Card>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <UIText className="text-red-700">{error}</UIText>
          </div>
        )}
        <Button type="submit" variant="primary" disabled={loading || avatarPreparing}>
          <UIText>{loading ? 'Saving...' : avatarPreparing ? 'Preparing photo...' : 'Save'}</UIText>
        </Button>
      </form>
    </Card>
  )
}

type ViewerJoinStatus = 'none' | 'member' | 'pending_request' | 'pending_invite'

interface CommunitySearchResult {
  id: string
  type: string
  name: string
  description?: string
  avatar?: string | null
  emoji?: string | null
  username?: string | null
  user_id?: string
  userJoinStatus?: ViewerJoinStatus
}

function joinActionForSpace(
  spaceId: string,
  serverStatus: ViewerJoinStatus | undefined,
  sessionJoinedIds: string[]
): 'join' | 'joined' | 'applied' | 'invited' {
  if (sessionJoinedIds.includes(spaceId)) return 'joined'
  switch (serverStatus) {
    case 'member':
      return 'joined'
    case 'pending_request':
      return 'applied'
    case 'pending_invite':
      return 'invited'
    default:
      return 'join'
  }
}

function OnboardingJoinCommunityStep({ onComplete }: { onComplete: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CommunitySearchResult[]>([])
  const [featuredSpaces, setFeaturedSpaces] = useState<Array<{
    id: string
    slug?: string | null
    name: string
    description?: string
    avatar?: string | null
    emoji?: string | null
    userJoinStatus?: ViewerJoinStatus
  }>>([])
  const [searching, setSearching] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [promptAnswer, setPromptAnswer] = useState('')
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [joinedSpaceIds, setJoinedSpaceIds] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadFeaturedSpaces = useCallback(async () => {
    try {
      const res = await fetch('/api/spaces/eligible-org-membership')
      const data = await res.json()
      const list = Array.isArray(data?.results) ? data.results : []
      setFeaturedSpaces(
        list.filter((x: any) => x && typeof x.id === 'string' && typeof x.name === 'string')
      )
    } catch {
      setFeaturedSpaces([])
    }
  }, [])

  useEffect(() => {
    void loadFeaturedSpaces()
  }, [loadFeaturedSpaces])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearching(true)
      fetch(`/api/portfolios/search?q=${encodeURIComponent(query.trim())}&joinable=1&limit=20`)
        .then((res) => res.json())
        .then((data) => {
          const list: CommunitySearchResult[] = (data.results ?? []).map((p: any) => ({
              id: p.id,
              type: p.type,
              name: p.name,
              description: p.description,
              avatar: p.avatar ?? null,
              emoji: p.emoji ?? null,
              username: p.username ?? null,
              user_id: p.user_id,
              userJoinStatus: p.userJoinStatus,
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

  const finishJoinStep = async () => {
    setSubmitting(true)
    setFeedback(null)
    try {
      const result = await setJoinCommunitySeen()
      if (!result.success) {
        setFeedback(result.error ?? 'Failed to update.')
        return
      }
      onComplete()
    } catch {
      setFeedback('An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  const joinOneSpace = async (portfolioId: string, prompt: string) => {
    setSubmitting(true)
    setFeedback(null)
    try {
      const result = await applyToActivityCallToJoin({
        portfolioId,
        promptAnswer: prompt.trim(),
      })
      if (!result?.success) {
        setFeedback(result?.error ?? 'Failed to join.')
        return
      }
      setJoinedSpaceIds((prev) =>
        prev.includes(portfolioId) ? prev : [...prev, portfolioId]
      )
      setShowJoinModal(false)
      setSelectedId(null)
      setPromptAnswer('')
      void loadFeaturedSpaces()
    } catch {
      setFeedback('An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId) {
      setFeedback('Please select a space.')
      return
    }
    await joinOneSpace(selectedId, promptAnswer)
  }

  const selectedCommunity =
    results.find((r) => r.id === selectedId) ?? (selectedId ? { name: 'Space', id: selectedId } : null)

  return (
    <>
      <Card variant="spacious" className="max-w-xl mx-auto">
        <Title as="h1" className="mb-2">
          Join spaces
        </Title>
        <Content className="mb-4">
          Join one or more spaces from recommendations or search, or go on without joining any. Tap Continue when you’re ready for the next step.
        </Content>
        <div className="space-y-4">
          {featuredSpaces.length > 0 && (
            <Card variant="subtle" padding="sm">
              <div className="space-y-2">
                <UIText className="text-gray-700">Recommended for you</UIText>
                <div className="space-y-2">
                  {featuredSpaces.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-col gap-2 px-3 py-2 rounded-lg bg-white border border-gray-100 min-w-0"
                    >
                      <div className="flex items-start justify-between gap-3 min-w-0">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <StickerAvatar
                            src={s.avatar ?? undefined}
                            alt={s.name}
                            type="space"
                            size={40}
                            emoji={s.emoji ?? undefined}
                            name={s.name}
                          />
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <Content className="truncate block min-w-0">{s.name}</Content>
                            {s.description ? (
                              <UIText className="text-gray-600 truncate block min-w-0 mt-0.5">
                                {s.description}
                              </UIText>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex-shrink-0 pt-0.5">
                          {(() => {
                            const action = joinActionForSpace(
                              s.id,
                              s.userJoinStatus,
                              joinedSpaceIds
                            )
                            if (action === 'join') {
                              return (
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  onClick={() => joinOneSpace(s.id, '')}
                                  disabled={submitting}
                                >
                                  <UIText>Join</UIText>
                                </Button>
                              )
                            }
                            const label =
                              action === 'joined'
                                ? 'Joined'
                                : action === 'applied'
                                  ? 'Applied'
                                  : 'Invited'
                            return (
                              <Button type="button" variant="secondary" size="sm" disabled>
                                <UIText>{label}</UIText>
                              </Button>
                            )
                          })()}
                        </div>
                      </div>
                      <UIText className="text-green-700 w-full min-w-0 break-words whitespace-pre-wrap">
                        You are verified as part of {s.name}, please join with one click!
                      </UIText>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
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
                          <UIButtonText className="text-gray-500 flex-shrink-0">Space</UIButtonText>
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
                      {(() => {
                        const action = joinActionForSpace(
                          r.id,
                          r.userJoinStatus,
                          joinedSpaceIds
                        )
                        if (action === 'join') {
                          return (
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
                              <UIText>Join</UIText>
                            </Button>
                          )
                        }
                        const label =
                          action === 'joined'
                            ? 'Joined'
                            : action === 'applied'
                              ? 'Applied'
                              : 'Invited'
                        return (
                          <Button type="button" variant="secondary" size="sm" disabled>
                            <UIText>{label}</UIText>
                          </Button>
                        )
                      })()}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button variant="primary" onClick={finishJoinStep} disabled={submitting}>
              <UIText>{submitting ? 'Saving...' : 'Continue'}</UIText>
            </Button>
          </div>
        </div>
      </Card>

      {showJoinModal && selectedId && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/40 p-4">
          <Card variant="spacious" className="w-full max-w-md">
            <Title as="h2" className="mb-2">
              Request to join {selectedCommunity?.name ?? 'space'}
            </Title>
            <Content className="mb-3">
              If this space requires approval, the owner/managers will review your request.
            </Content>
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <UIText as="label" className="block mb-1">
                  Message (optional)
                </UIText>
                <textarea
                  value={promptAnswer}
                  onChange={(e) => setPromptAnswer(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
