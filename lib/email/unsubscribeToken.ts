import { createHmac, timingSafeEqual } from 'crypto'

const ALG = 'sha256'
const SEP = '.'

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('UNSUBSCRIBE_SECRET or CRON_SECRET (min 16 chars) is required for unsubscribe tokens')
  }
  return secret
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Buffer | null {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)
    return Buffer.from(base64, 'base64')
  } catch {
    return null
  }
}

/**
 * Create a signed token that encodes userId for one-click unsubscribe.
 * Use verifyUnsubscribeToken to validate and get userId back.
 */
export function createUnsubscribeToken(userId: string): string {
  const secret = getSecret()
  const payload = Buffer.from(userId, 'utf8')
  const payloadB64 = base64UrlEncode(payload)
  const sig = createHmac(ALG, secret).update(userId).digest()
  const sigB64 = base64UrlEncode(sig)
  return `${payloadB64}${SEP}${sigB64}`
}

/**
 * Verify token and return userId, or null if invalid.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  if (!token || typeof token !== 'string') return null
  const idx = token.lastIndexOf(SEP)
  if (idx <= 0) return null
  const payloadB64 = token.slice(0, idx)
  const sigB64 = token.slice(idx + 1)
  const payloadBuf = base64UrlDecode(payloadB64)
  const sigBuf = base64UrlDecode(sigB64)
  if (!payloadBuf || !sigBuf) return null
  const userId = payloadBuf.toString('utf8')
  if (!userId) return null
  try {
    const secret = getSecret()
    const expectedSig = createHmac(ALG, secret).update(userId).digest()
    if (expectedSig.length !== sigBuf.length || !timingSafeEqual(expectedSig, sigBuf)) return null
    return userId
  } catch {
    return null
  }
}
