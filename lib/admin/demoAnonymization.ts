const BLOCK = '████████████████████'

const FAKE_NAMES = [
  'Alice Smith',
  'Bob Johnson',
  'Carol Williams',
  'David Brown',
  'Emily Davis',
  'Frank Miller',
  'Grace Wilson',
  'Henry Moore',
  'Isabella Taylor',
  'Jack Anderson',
  'Karen Thomas',
  'Liam Jackson',
  'Mia White',
  'Noah Harris',
  'Olivia Martin',
  'Paul Thompson',
  'Quinn Garcia',
  'Ruby Martinez',
  'Samuel Robinson',
  'Tina Clark',
  'Uma Rodriguez',
  'Victor Lewis',
  'Wendy Lee',
  'Xavier Walker',
  'Yara Hall',
  'Zach Young',
  'Chloe Allen',
  'Daniel King',
  'Ella Wright',
  'Finn Scott',
  'Gianna Green',
  'Hugo Baker',
  'Ivy Adams',
  'Jonah Nelson',
  'Kylie Carter',
  'Logan Mitchell',
  'Nora Perez',
  'Owen Roberts',
  'Piper Turner',
  'Riley Phillips',
  'Stella Campbell',
  'Theo Parker',
  'Violet Evans',
  'Wyatt Edwards',
  'Zoe Collins',
]

function hashToIndex(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return Math.abs(hash) >>> 0
}

/**
 * Returns mock display name when demo anonymization is enabled.
 * @param demoEnabled - when false, returns '' so caller uses real name
 */
export function getDemoDisplayName(
  userId: string,
  isMatcher: boolean,
  demoEnabled: boolean
): string {
  if (!demoEnabled) {
    return ''
  }
  if (isMatcher) {
    return 'John Doe'
  }
  const idx = hashToIndex(userId) % FAKE_NAMES.length
  return FAKE_NAMES[idx]
}

/**
 * Returns masked string when demo anonymization is enabled.
 */
export function maskEmail(
  email: string | null | undefined,
  demoEnabled: boolean
): string {
  if (!demoEnabled) {
    return email || ''
  }
  return BLOCK
}

/**
 * Returns masked description when demo anonymization is enabled.
 */
export function maskDescription(
  description: string | null | undefined,
  demoEnabled: boolean
): string | null {
  if (!demoEnabled) {
    return description ?? null
  }
  return description ? BLOCK : null
}
