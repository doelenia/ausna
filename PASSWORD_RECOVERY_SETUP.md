# Password Recovery Setup Guide

This guide explains how to configure Supabase to ensure password recovery emails redirect users to the reset password page instead of auto-logging them in.

## How It Works

1. **User requests password reset** → `/forgot-password` page
2. **Email sent** → Supabase sends recovery email with link
3. **User clicks link** → Supabase verifies token and redirects to `/reset-password` with session tokens
4. **InviteHandler intercepts** → Detects `type=recovery` and ensures user goes to reset password page
5. **User resets password** → Sets new password on `/reset-password` page

## Required Configuration

### 1. Supabase Dashboard - URL Configuration

Go to **Authentication → URL Configuration** in your Supabase Dashboard and ensure:

1. **Site URL**: Set to your production domain (e.g., `https://yourdomain.com`)
2. **Redirect URLs**: Add your reset password URL to the allowed list:
   - `https://yourdomain.com/reset-password`
   - `http://localhost:3000/reset-password` (for development)

### 2. Supabase Dashboard - Email Template

Go to **Authentication → Email Templates** and check the **Reset Password** template.

The template should use `{{ .ConfirmationURL }}` which automatically includes the `redirect_to` parameter we pass when calling `resetPasswordForEmail`.

**Default template** (should work as-is):
```html
<h2>Reset Password</h2>
<p>Follow this link to reset the password for your user:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
```

**Important**: The `.ConfirmationURL` variable automatically includes:
- The verification token
- The `type=recovery` parameter
- The `redirect_to` parameter (set to `/reset-password`)

### 3. Environment Variables

Ensure `NEXT_PUBLIC_SITE_URL` is set in your environment:

```env
# Production
NEXT_PUBLIC_SITE_URL=https://yourdomain.com

# Development (optional - will fall back to localhost:3000)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## How the Flow Works

### Step 1: User Requests Reset
When a user submits the forgot password form, we call:
```typescript
supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${siteUrl}/reset-password`
})
```

### Step 2: Supabase Sends Email
Supabase generates a `.ConfirmationURL` that looks like:
```
https://your-project.supabase.co/auth/v1/verify?token=TOKEN_HASH&type=recovery&redirect_to=https://yourdomain.com/reset-password
```

### Step 3: User Clicks Link
When the user clicks the link:
1. Supabase's `/auth/v1/verify` endpoint verifies the token
2. Supabase creates a session and redirects to: `https://yourdomain.com/reset-password#access_token=...&type=recovery&refresh_token=...`

### Step 4: InviteHandler Intercepts
The `InviteHandler` component (loaded on every page) detects:
- Hash fragment with `type=recovery`
- Sets the session (so user can reset password)
- Redirects to `/reset-password` page

### Step 5: User Resets Password
The `/reset-password` page:
- Checks for valid session
- Shows password reset form
- Updates password when submitted
- Redirects to login with success message

## Troubleshooting

### Issue: Users are auto-logged in instead of going to reset page

**Possible causes:**
1. **Redirect URL not in allowed list**: Check Supabase Dashboard → Authentication → URL Configuration
2. **Email template issue**: Ensure template uses `{{ .ConfirmationURL }}` (not a hardcoded URL)
3. **InviteHandler not running**: Check browser console for errors

**Solution:**
1. Add `/reset-password` to allowed redirect URLs in Supabase Dashboard
2. Verify email template uses `{{ .ConfirmationURL }}`
3. Check browser console for any JavaScript errors

### Issue: "Invalid or expired link" error

**Possible causes:**
1. Token expired (default: 1 hour)
2. Token already used (recovery tokens are single-use)
3. Session not set properly

**Solution:**
- Request a new password reset email
- Ensure `InviteHandler` is properly setting the session

### Issue: Redirect URL not working

**Possible causes:**
1. `NEXT_PUBLIC_SITE_URL` not set correctly
2. URL not in Supabase allowed list
3. URL mismatch between what we send and what's allowed

**Solution:**
1. Verify `NEXT_PUBLIC_SITE_URL` matches your actual domain
2. Add both production and development URLs to Supabase allowed list
3. Check Supabase logs for redirect URL validation errors

## Testing

1. **Test forgot password flow:**
   - Go to `/forgot-password`
   - Enter your email
   - Check email for recovery link
   - Click link → should go to `/reset-password` (not `/main`)
   - Reset password → should redirect to `/login?password_reset=success`

2. **Test from account page:**
   - Log in
   - Go to `/account/[your-id]`
   - Scroll to "Change Password" section
   - Enter current password and new password
   - Should update successfully

## Security Notes

- Recovery tokens expire after 1 hour (configurable in Supabase)
- Recovery tokens are single-use (cannot be reused)
- Session is required to reset password (prevents unauthorized access)
- Current password verification required when changing password from account page

