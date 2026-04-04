import { cache } from 'react'
import { getOnboardingStatus } from '@/lib/onboarding/status'

/** One onboarding load per user per RSC request when called from multiple server components. */
export const getCachedOnboardingStatus = cache((userId: string) => getOnboardingStatus(userId))
