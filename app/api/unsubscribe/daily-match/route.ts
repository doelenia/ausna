import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribeToken'
import { getSiteUrl } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

/**
 * Mark the user as unsubscribed from daily activity match emails.
 * Returns the human portfolio row id if found, or null.
 */
async function setDailyMatchUnsubscribed(userId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data: row, error: fetchError } = await supabase
    .from('portfolios')
    .select('id, metadata')
    .eq('type', 'human')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (fetchError || !row) return false

  const metadata = (row as any).metadata || {}
  const properties = metadata.properties || {}
  const daily = properties.daily_explore_match || {}

  const updatedMeta = {
    ...metadata,
    properties: {
      ...properties,
      daily_explore_match: {
        ...daily,
        unsubscribed: true,
      },
    },
  }

  const { error: updateError } = await supabase
    .from('portfolios')
    .update({ metadata: updatedMeta })
    .eq('id', (row as any).id)

  return !updateError
}

/**
 * GET: Unsubscribe and show confirmation page.
 * POST: Unsubscribe only (for List-Unsubscribe-Post one-click). Returns 200/202.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim() ?? null
  if (!token) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invalid link</title></head><body><p>This unsubscribe link is invalid or has expired.</p><p><a href="${getSiteUrl()}">Go to Ausna</a></p></body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const userId = verifyUnsubscribeToken(token)
  if (!userId) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invalid link</title></head><body><p>This unsubscribe link is invalid or has expired.</p><p><a href="${getSiteUrl()}">Go to Ausna</a></p></body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const updated = await setDailyMatchUnsubscribed(userId)
  const siteUrl = getSiteUrl()
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Unsubscribed – Ausna</title>
</head>
<body style="margin:0; padding:24px; font-family: system-ui, sans-serif; background:#f9fafb;">
  <div style="max-width: 480px; margin: 0 auto;">
    <h1 style="font-size: 24px; font-weight: 600; color: #111;">You’re unsubscribed</h1>
    <p style="font-size: 16px; line-height: 1.6; color: #374151;">
      ${updated ? "You won’t receive daily activity match emails from Ausna anymore. You can change this in your account settings later." : "Your preference has been recorded."}
    </p>
    <p style="margin-top: 24px;">
      <a href="${siteUrl}" style="color: #2563eb; text-decoration: none;">Back to Ausna</a>
    </p>
  </div>
</body>
</html>`
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

/**
 * POST: One-click unsubscribe (RFC 8058 List-Unsubscribe-Post).
 * Body: application/x-www-form-urlencoded or JSON with List-Unsubscribe=One-Click.
 * Returns 200 or 202 for success.
 */
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

  const userId = verifyUnsubscribeToken(token)
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 })
  }

  const updated = await setDailyMatchUnsubscribed(userId)
  return NextResponse.json(
    { success: true, unsubscribed: updated },
    { status: 202 }
  )
}
