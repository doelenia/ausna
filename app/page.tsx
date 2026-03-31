import { redirect } from 'next/navigation'

export default function RootPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const code = typeof searchParams?.code === 'string' ? searchParams.code : null
  const errorCode =
    typeof searchParams?.error_code === 'string' ? searchParams.error_code : null
  const error =
    typeof searchParams?.error === 'string' ? searchParams.error : null
  const errorDescription =
    typeof searchParams?.error_description === 'string'
      ? searchParams.error_description
      : null

  // If Supabase redirected to "/" with a code, route it through /auth/callback
  // so we can exchange it for a session cookie server-side.
  if (code) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&returnTo=${encodeURIComponent('/main')}&emailConfirmation=1`)
  }

  // Preserve verification errors so the banner can explain what happened.
  if (errorCode || error) {
    const sp = new URLSearchParams()
    if (error) sp.set('error', error)
    if (errorCode) sp.set('error_code', errorCode)
    if (errorDescription) sp.set('error_description', errorDescription)
    redirect(`/main?${sp.toString()}`)
  }

  redirect('/main')
}


