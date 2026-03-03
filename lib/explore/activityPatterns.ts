export const DEFAULT_ACTIVITY_PATTERN_PATH = '/email/activity_pattern.jpg'

/**
 * Public (Next.js `public/`) paths for explore + email background patterns.
 *
 * Add new patterns here (e.g. '/email/patterns/foo.jpg').
 * These paths are stored in the user's portfolio snapshot so the UI/email
 * can consistently render the same pattern for a given run.
 */
const ACTIVITY_PATTERN_PATHS: string[] = [DEFAULT_ACTIVITY_PATTERN_PATH]

export function getRandomActivityPatternPath(): string {
  if (ACTIVITY_PATTERN_PATHS.length === 0) return DEFAULT_ACTIVITY_PATTERN_PATH
  const idx = Math.floor(Math.random() * ACTIVITY_PATTERN_PATHS.length)
  return ACTIVITY_PATTERN_PATHS[idx] ?? DEFAULT_ACTIVITY_PATTERN_PATH
}

