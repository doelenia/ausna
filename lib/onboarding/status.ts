import { hasUserAgreedToCurrent } from '@/lib/legal/documents'
import { getHumanPortfolio } from '@/lib/portfolio/human'
import type { HumanPortfolioMetadata, HumanAvailabilitySchedule } from '@/types/portfolio'

export const ONBOARDING_STEP_IDS = ['legal', 'profile', 'availabilities', 'join_community', 'open_calls'] as const
export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number]

export interface OnboardingStep {
  id: OnboardingStepId
  label: string
  complete: boolean
}

export interface OnboardingStatus {
  steps: OnboardingStep[]
  incompleteStepIds: OnboardingStepId[]
}

const STEP_LABELS: Record<OnboardingStepId, string> = {
  legal: 'Terms & Privacy',
  profile: 'Profile',
  availabilities: 'Availabilities',
  join_community: 'Join community',
  open_calls: 'Open calls',
}

function hasAvailabilityEnabled(schedule: HumanAvailabilitySchedule | undefined): boolean {
  if (!schedule || typeof schedule !== 'object') return false
  const days = [
    schedule.monday,
    schedule.tuesday,
    schedule.wednesday,
    schedule.thursday,
    schedule.friday,
    schedule.saturday,
    schedule.sunday,
  ]
  return days.some((day) => day && day.enabled === true)
}

function isProfileFilled(meta: HumanPortfolioMetadata | null): boolean {
  if (!meta) return false
  const basic = meta.basic
  if (!basic || typeof basic !== 'object') return false
  const name = (basic.name ?? '').toString().trim()
  const description = (basic.description ?? '').toString().trim()
  const avatar = (basic.avatar ?? '').toString().trim()
  return name.length > 0 && description.length > 0 && avatar.length > 0
}

/**
 * Returns onboarding status for a user: which steps are complete and which are incomplete.
 * Step 1 (legal) is derived from user_legal_agreements + legal_documents.
 * Steps 2–4 use human portfolio metadata.onboarding and/or derived from existing fields.
 */
export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  const [legalTermsOk, legalPrivacyOk, portfolio] = await Promise.all([
    hasUserAgreedToCurrent(userId, 'terms'),
    hasUserAgreedToCurrent(userId, 'privacy'),
    getHumanPortfolio(userId),
  ])

  const legalComplete = legalTermsOk && legalPrivacyOk
  const meta = (portfolio?.metadata ?? null) as HumanPortfolioMetadata | null
  const onboarding = meta?.onboarding

  const profileComplete =
    onboarding?.profile_complete === true || isProfileFilled(meta)
  const schedule = meta?.properties?.availability_schedule
  const availabilitiesComplete =
    onboarding?.availabilities_complete === true || hasAvailabilityEnabled(schedule)
  const joinCommunitySeen = onboarding?.join_community_seen === true
  const openCallsSetupComplete = onboarding?.open_calls_setup_complete === true

  const steps: OnboardingStep[] = [
    { id: 'legal', label: STEP_LABELS.legal, complete: legalComplete },
    { id: 'profile', label: STEP_LABELS.profile, complete: profileComplete },
    { id: 'availabilities', label: STEP_LABELS.availabilities, complete: availabilitiesComplete },
    { id: 'join_community', label: STEP_LABELS.join_community, complete: joinCommunitySeen },
    { id: 'open_calls', label: STEP_LABELS.open_calls, complete: openCallsSetupComplete },
  ]

  const incompleteStepIds = steps.filter((s) => !s.complete).map((s) => s.id)

  return { steps, incompleteStepIds }
}
