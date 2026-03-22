import { NextRequest, NextResponse } from 'next/server'
import {
  verifyEmailUnsubscribeToken,
  type EmailUnsubscribeChannel,
} from '@/lib/email/unsubscribeToken'
import {
  applyEmailUnsubscribe,
  channelUnsubscribeDescription,
} from '@/lib/email/applyEmailUnsubscribe'
import { getSiteUrl } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

function confirmationHtml(channel: EmailUnsubscribeChannel, updated: boolean): string {
  const siteUrl = getSiteUrl()
  const kind = channelUnsubscribeDescription(channel)
  const msg = updated
    ? `You won’t receive ${kind} from Ausna anymore. You can re-enable notifications from account settings when we add that option.`
    : 'Your preference has been recorded.'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Unsubscribed – Ausna</title>
</head>
<body style="margin:0; padding:24px; font-family: system-ui, sans-serif; background:#f9fafb;">
  <div style="max-width: 480px; margin: 0 auto;">
    <h1 style="font-size: 24px; font-weight: 600; color: #111;">You’re unsubscribed</h1>
    <p style="font-size: 16px; line-height: 1.6; color: #374151;">${msg}</p>
    <p style="margin-top: 24px;">
      <a href="${siteUrl}" style="color: #2563eb; text-decoration: none;">Back to Ausna</a>
    </p>
  </div>
</body>
</html>`
}

function invalidTokenHtml(): string {
  const siteUrl = getSiteUrl()
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invalid link</title></head><body><p>This unsubscribe link is invalid or has expired.</p><p><a href="${siteUrl}">Go to Ausna</a></p></body></html>`
}

/**
 * Unified one-click unsubscribe for digest emails (messages, feed, daily match).
 * GET: confirm in browser. POST: RFC 8058 List-Unsubscribe-Post.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim() ?? null
  if (!token) {
    return new NextResponse(invalidTokenHtml(), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const decoded = verifyEmailUnsubscribeToken(token)
  if (!decoded) {
    return new NextResponse(invalidTokenHtml(), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const updated = await applyEmailUnsubscribe(decoded.userId, decoded.channel)
  return new NextResponse(confirmationHtml(decoded.channel, updated), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function POST(request: NextRequest) {
  let token: string | null = request.nextUrl.searchParams.get('token')?.trim() ?? null
  if (!token) {
    try {
      const contentType = request.headers.get('content-type') || ''
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData()
        token = (formData.get('token') as string)?.trim() ?? null
      } else if (contentType.includes('application/json')) {
        const body = await request.json()
        token = (body?.token as string)?.trim() ?? null
      }
    } catch {
      // ignore
    }
  }

  if (!token) {
    return NextResponse.json({ success: false, error: 'Missing token' }, { status: 400 })
  }

  const decoded = verifyEmailUnsubscribeToken(token)
  if (!decoded) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 })
  }

  const updated = await applyEmailUnsubscribe(decoded.userId, decoded.channel)
  return NextResponse.json(
    { success: true, unsubscribed: updated, channel: decoded.channel },
    { status: 202 }
  )
}
