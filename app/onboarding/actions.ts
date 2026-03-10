'use server'

import { createClient } from '@/lib/supabase/server'
import { getOnboardingStatus, type OnboardingStatus, type OnboardingStepId } from '@/lib/onboarding/status'
import type { HumanPortfolioMetadata, HumanPortfolioOnboarding } from '@/types/portfolio'
import { getActiveLegalDocument } from '@/lib/legal/documents'
import { createUserAgreement } from '@/lib/legal/documents'
import { ensureHumanPortfolio } from '@/lib/portfolio/human'
import { uploadAvatar } from '@/lib/storage/avatars-server'
import type { HumanAvailabilitySchedule } from '@/types/portfolio'
import { createNote } from '@/app/notes/actions'

export type { OnboardingStatus, OnboardingStepId }

async function getCurrentUserAndClient(): Promise<{
  user: { id: string }
  supabase: any
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { user: { id: user.id }, supabase }
}

export async function getOnboardingStatusForCurrentUser(): Promise<OnboardingStatus | null> {
  const auth = await getCurrentUserAndClient()
  if (!auth) return null
  return await getOnboardingStatus(auth.user.id)
}

export interface SetOnboardingFlagResult {
  success: boolean
  error?: string
}

/**
 * Merge an onboarding flag into the current user's human portfolio metadata.
 */
export async function setOnboardingFlag(
  flag: keyof HumanPortfolioOnboarding,
  value: boolean | string
): Promise<SetOnboardingFlagResult> {
  try {
    const auth = await getCurrentUserAndClient()
    if (!auth) return { success: false, error: 'Unauthorized' }
    const { user, supabase } = auth
    const portfolio = await ensureHumanPortfolio(user.id)

    const meta = (portfolio.metadata ?? {}) as HumanPortfolioMetadata
    const existingOnboarding = meta.onboarding ?? {}
    const updatedOnboarding: HumanPortfolioOnboarding = {
      ...existingOnboarding,
      [flag]: value,
      ...(typeof value === 'boolean' ? { updated_at: new Date().toISOString() } : {}),
    }

    const updatedMetadata: HumanPortfolioMetadata = {
      ...meta,
      onboarding: updatedOnboarding,
    }

    const { error } = await supabase
      .from('portfolios')
      .update({ metadata: updatedMetadata })
      .eq('id', portfolio.id)

    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Failed to update onboarding' }
  }
}

export async function setProfileComplete(): Promise<SetOnboardingFlagResult> {
  return setOnboardingFlag('profile_complete', true)
}

export async function setAvailabilitiesComplete(): Promise<SetOnboardingFlagResult> {
  return setOnboardingFlag('availabilities_complete', true)
}

export async function setJoinCommunitySeen(): Promise<SetOnboardingFlagResult> {
  return setOnboardingFlag('join_community_seen', true)
}

export interface CompleteOpenCallsOnboardingResult {
  success: boolean
  noteId?: string
  error?: string
}

export async function completeOpenCallsOnboarding(input: {
  title: string
  description: string
  endDate?: string | null
}): Promise<CompleteOpenCallsOnboardingResult> {
  try {
    const auth = await getCurrentUserAndClient()
    if (!auth) return { success: false, error: 'Unauthorized' }

    const title = (input.title ?? '').trim()
    const description = (input.description ?? '').trim()
    const endDateRaw = input.endDate ?? null

    if (!title) return { success: false, error: 'Open call title is required' }
    if (!description) return { success: false, error: 'Open call description is required' }

    let endDateIso: string | null = null
    if (endDateRaw) {
      const d = new Date(endDateRaw)
      if (!Number.isFinite(d.getTime())) {
        return { success: false, error: 'Invalid end date' }
      }
      endDateIso = d.toISOString()
    }

    const formData = new FormData()
    formData.set('text', description)
    formData.set('note_type', 'open_call')
    formData.set('open_call_title', title)
    formData.set('assigned_portfolios', JSON.stringify([]))
    formData.set('open_call_never_ends', endDateIso ? 'false' : 'true')
    if (endDateIso) {
      formData.set('open_call_end_date', endDateIso)
    }

    const created = await createNote(formData)
    if (!created.success || !created.noteId) {
      return { success: false, error: created.error ?? 'Failed to create open call' }
    }

    const flagged = await setOnboardingFlag('open_calls_setup_complete', true)
    if (!flagged.success) {
      return { success: false, error: flagged.error ?? 'Failed to update onboarding' }
    }

    return { success: true, noteId: created.noteId }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Failed to complete open calls onboarding' }
  }
}

export interface AgreeToLegalResult {
  success: boolean
  error?: string
}

/** Record agreement to current Terms and Privacy for the current user. */
/** Get current user's human portfolio for onboarding forms (profile, availability). */
export async function getMyHumanPortfolioForOnboarding(): Promise<{
  success: boolean
  portfolio?: { id: string; user_id: string; metadata: HumanPortfolioMetadata }
  error?: string
}> {
  try {
    const auth = await getCurrentUserAndClient()
    if (!auth) return { success: false, error: 'Unauthorized' }
    const portfolio = await ensureHumanPortfolio(auth.user.id)
    return {
      success: true,
      portfolio: { id: portfolio.id, user_id: portfolio.user_id, metadata: portfolio.metadata as HumanPortfolioMetadata },
    }
  } catch (e: any) {
    return { success: false, error: e?.message }
  }
}

export async function agreeToCurrentLegal(): Promise<AgreeToLegalResult> {
  try {
    const auth = await getCurrentUserAndClient()
    if (!auth) return { success: false, error: 'Unauthorized' }
    const { user } = auth
    const [termsDoc, privacyDoc] = await Promise.all([
      getActiveLegalDocument('terms'),
      getActiveLegalDocument('privacy'),
    ])
    if (!termsDoc || !privacyDoc) return { success: false, error: 'Legal documents not found' }
    await createUserAgreement({
      userId: user.id,
      documentType: 'terms',
      documentVersion: termsDoc.version,
    })
    await createUserAgreement({
      userId: user.id,
      documentType: 'privacy',
      documentVersion: privacyDoc.version,
    })

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Failed to record agreement' }
  }
}

export interface SaveOnboardingProfileResult {
  success: boolean
  error?: string
}

/**
 * Save onboarding profile fields to the current user's human portfolio.
 * Accepts FormData so we can include an optional avatar file.
 */
export async function saveOnboardingProfile(formData: FormData): Promise<SaveOnboardingProfileResult> {
  try {
    const auth = await getCurrentUserAndClient()
    if (!auth) return { success: false, error: 'Unauthorized' }
    const { user, supabase } = auth

    const name = (formData.get('name') as string | null)?.trim() || ''
    const description = (formData.get('description') as string | null)?.trim() || ''
    const avatarFile = (formData.get('avatar') as File | null) ?? null

    if (!name) return { success: false, error: 'Name is required' }
    if (!description) return { success: false, error: 'Description is required' }

    const portfolio = await ensureHumanPortfolio(user.id)
    const meta = (portfolio.metadata ?? {}) as HumanPortfolioMetadata
    const existingOnboarding = meta.onboarding ?? {}

    let nextAvatarUrl = (meta.basic?.avatar as string | undefined) || ''
    if (avatarFile) {
      const uploaded = await uploadAvatar(portfolio.id, avatarFile)
      nextAvatarUrl = uploaded.url
    }
    if (!nextAvatarUrl || nextAvatarUrl.trim().length === 0) {
      return { success: false, error: 'Avatar is required' }
    }

    const updatedMetadata: HumanPortfolioMetadata = {
      ...meta,
      basic: {
        ...meta.basic,
        name,
        description,
        avatar: nextAvatarUrl,
      },
      onboarding: {
        ...existingOnboarding,
        profile_complete: true,
        updated_at: new Date().toISOString(),
      },
    }

    const { error } = await supabase
      .from('portfolios')
      .update({ metadata: updatedMetadata })
      .eq('id', portfolio.id)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Failed to save profile' }
  }
}

export interface SaveOnboardingAvailabilityResult {
  success: boolean
  error?: string
}

function normalizeAvailabilitySchedule(raw: unknown): HumanAvailabilitySchedule | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, any>
  const timeRegex = /^([01]\\d|2[0-3]):[0-5]\\d$/

  const normalized: HumanAvailabilitySchedule = {}
  for (const day of [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ] as Array<keyof HumanAvailabilitySchedule>) {
    const value = source[day as string]
    if (!value || typeof value !== 'object') continue
    const enabled = Boolean(value.enabled)
    const startTime =
      typeof value.startTime === 'string' && timeRegex.test(value.startTime)
        ? value.startTime
        : undefined
    const endTime =
      typeof value.endTime === 'string' && timeRegex.test(value.endTime)
        ? value.endTime
        : undefined

    if (!enabled && !startTime && !endTime) continue

    normalized[day] = {
      enabled,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null
}

/** Save onboarding availability schedule to human portfolio + mark step complete. */
export async function saveOnboardingAvailabilitySchedule(
  scheduleJson: string
): Promise<SaveOnboardingAvailabilityResult> {
  try {
    const auth = await getCurrentUserAndClient()
    if (!auth) return { success: false, error: 'Unauthorized' }
    const { user, supabase } = auth

    let parsed: unknown
    try {
      parsed = JSON.parse(scheduleJson)
    } catch {
      return { success: false, error: 'Invalid schedule' }
    }

    const normalized = normalizeAvailabilitySchedule(parsed)
    if (!normalized) return { success: false, error: 'Please enable at least one day' }

    const hasEnabled = Object.values(normalized).some((d: any) => d?.enabled === true)
    if (!hasEnabled) return { success: false, error: 'Please enable at least one day' }

    const portfolio = await ensureHumanPortfolio(user.id)
    const meta = (portfolio.metadata ?? {}) as HumanPortfolioMetadata
    const existingOnboarding = meta.onboarding ?? {}
    const properties = (meta.properties ?? {}) as Record<string, any>

    const updatedMetadata: HumanPortfolioMetadata = {
      ...meta,
      properties: {
        ...properties,
        availability_schedule: normalized,
      } as any,
      onboarding: {
        ...existingOnboarding,
        availabilities_complete: true,
        updated_at: new Date().toISOString(),
      },
    }

    const { error } = await supabase
      .from('portfolios')
      .update({ metadata: updatedMetadata })
      .eq('id', portfolio.id)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Failed to save availability' }
  }
}
