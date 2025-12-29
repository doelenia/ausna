import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Use publishable key (recommended) with fallback to legacy anon key for backward compatibility
  const apiKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // createBrowserClient from @supabase/ssr automatically handles cookies
  // It sets cookies with proper SameSite=Lax which allows them to be sent with server actions
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, apiKey)
}

