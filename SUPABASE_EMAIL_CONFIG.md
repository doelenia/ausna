# Supabase Email Confirmation URL Configuration

## Issue

Supabase was sending confirmation emails with `.ConfirmationURL` based on `localhost` instead of your production domain.

## Root Causes

1. **Client-side code using `window.location.origin`**: The `AuthForm` and `OAuthButton` components were using `window.location.origin` for the `emailRedirectTo` parameter, which resolves to `http://localhost:3000` in development environments.

2. **Missing environment variable**: The `NEXT_PUBLIC_SITE_URL` environment variable may not have been set in production, causing the code to fall back to localhost.

3. **Supabase Dashboard Site URL**: Supabase also uses the "Site URL" setting from the dashboard for email confirmations, which may have been set to localhost.

## Solution

### Code Changes

1. **Created utility function** (`lib/utils/site-url.ts`):
   - Prioritizes `NEXT_PUBLIC_SITE_URL` environment variable
   - Falls back to `window.location.origin` only in development
   - Provides `getAuthCallbackUrl()` helper for consistent callback URLs

2. **Updated components**:
   - `components/auth/AuthForm.tsx`: Now uses `getAuthCallbackUrl()` instead of `window.location.origin`
   - `components/auth/OAuthButton.tsx`: Now uses `getAuthCallbackUrl()` instead of `window.location.origin`

### Required Configuration

#### 1. Environment Variables

Make sure `NEXT_PUBLIC_SITE_URL` is set in your production environment:

```env
# Production
NEXT_PUBLIC_SITE_URL=https://yourdomain.com

# Development (optional - will fall back to localhost:3000)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**For Vercel deployments:**
- Set `NEXT_PUBLIC_SITE_URL` in your Vercel project settings
- Or it will automatically use `VERCEL_URL` if available (see `app/admin/actions.ts` for reference)

#### 2. Supabase Dashboard Configuration

**CRITICAL**: You must also configure the Site URL in your Supabase Dashboard:

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **URL Configuration**
3. Set the **Site URL** to your production domain (e.g., `https://yourdomain.com`)
4. Add your production domain to **Redirect URLs** (e.g., `https://yourdomain.com/auth/callback`)

**Why this matters:**
- Supabase uses the Site URL from the dashboard as a fallback for email confirmations
- Even if you pass `emailRedirectTo` in the code, Supabase validates it against the configured Site URL
- If the Site URL is set to localhost, confirmation emails will use localhost URLs

### Verification

After making these changes:

1. **Check environment variable**: Ensure `NEXT_PUBLIC_SITE_URL` is set correctly in production
2. **Check Supabase Dashboard**: Verify Site URL is set to your production domain
3. **Test signup flow**: Create a test account and verify the confirmation email contains the correct production URL
4. **Test OAuth flow**: Verify OAuth redirects work correctly

### Files Modified

- `lib/utils/site-url.ts` (new file)
- `components/auth/AuthForm.tsx`
- `components/auth/OAuthButton.tsx`

### Related Files

- `app/admin/actions.ts`: Already uses `NEXT_PUBLIC_SITE_URL` correctly for invite emails
- `app/auth/callback/route.ts`: Handles the callback redirect

## Additional Notes

- The `emailRedirectTo` parameter in `signUp()` is used for email confirmation links
- The `redirectTo` parameter in `signInWithOAuth()` is used for OAuth callback redirects
- Both should point to `/auth/callback` which then redirects to `/main`
- Always use the utility function `getAuthCallbackUrl()` for consistency

