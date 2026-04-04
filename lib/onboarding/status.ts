import { hasUserAgreedToCurrent } from '@/lib/legal/documents'
import { getHumanPortfolio } from '@/lib/portfolio/human'
import type { HumanPortfolioMetadata } from '@/types/portfolio'

export const ONBOARDING_STEP_IDS = ['legal', 'profile', 'join_community', 'open_calls'] as const
export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number]

/** Always surfaced on the “Join a space” onboarding step (with org-eligible spaces). */
export const ONBOARDING_JOIN_SPACES_PINNED_PORTFOLIO_ID =
  '9f4fc0af-8997-494e-945c-d2831eaf258a' as const

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
  join_community: 'Join a space',
  open_calls: 'Open calls',
}

function isProfileFilled(meta: HumanPortfolioMetadata | null): boolean {
  if (!meta) return false
  const basic = meta.basic
  if (!basic || typeof basic !== 'object') return false
  const name = (basic.name ?? '').toString().trim()
  const avatar = (basic.avatar ?? '').toString().trim()
  return name.length > 0 && avatar.length > 0
}

/**
 * Returns onboarding status for a user: which steps are complete and which are incomplete.
 * Step 1 (legal) is derived from user_legal_agreements + legal_documents.
 * Later steps use human portfolio metadata.onboarding and/or derived from existing fields.
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
  const rawOpenCallsSetupComplete = onboarding?.open_calls_setup_complete ?? null
  const onboardingFlagOpenCallsComplete = rawOpenCallsSetupComplete === true

  // Your desired behavior:
  // - open_calls_setup_complete === true => complete
  // - open_calls_setup_complete is false or missing/undefined => incomplete
  const openCallsSetupComplete = onboardingFlagOpenCallsComplete

  const profileComplete =
    onboarding?.profile_complete === true || isProfileFilled(meta)
  const joinCommunitySeen = onboarding?.join_community_seen === true
  const steps: OnboardingStep[] = [
    { id: 'legal', label: STEP_LABELS.legal, complete: legalComplete },
    { id: 'profile', label: STEP_LABELS.profile, complete: profileComplete },
    { id: 'join_community', label: STEP_LABELS.join_community, complete: joinCommunitySeen },
    { id: 'open_calls', label: STEP_LABELS.open_calls, complete: openCallsSetupComplete },
  ]

  const incompleteStepIds = steps.filter((s) => !s.complete).map((s) => s.id)

  return { steps, incompleteStepIds }
}
