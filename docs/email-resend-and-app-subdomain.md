# Procedure: Auth Emails via Resend + App Subdomain (app.ausna.co)

This document outlines the steps to:

1. **Use Resend for all auth-related emails** (Supabase → Resend SMTP): sign up confirmation, password reset, magic link, and invite-by-email (contact invites).
2. **Use the subdomain app.ausna.co for all email communication** — links in emails (explore, unsubscribe, invite, reset password) point to app.ausna.co. The main app can stay at ausna.co (email-only subdomain) or the whole app can be served at app.ausna.co.
3. **Keep transactional emails (e.g. daily activity match)** on Resend with links using app.ausna.co.

**Redirect URLs:** If email links send users to app.ausna.co, you **must add** app.ausna.co to Supabase’s allowed Redirect URLs (e.g. `https://app.ausna.co/**`). Supabase only redirects to allowed URLs. You can keep your main domain in the list as well; you don’t have to remove it.

---

## 1. Subdomain and hosting (app.ausna.co)

### 1.1 DNS

- In your DNS provider for **ausna.co**, add a record for **app**:
  - **Type:** `CNAME` (or `A` if you use a fixed IP)
  - **Name:** `app`
  - **Value:**  
    - Vercel: `cname.vercel-dns.com` (or the value Vercel shows for your project domain).  
    - Or follow your host’s instructions for the app subdomain.
- Optional: add **www.app** or **app.ausna.co** redirect if you want a canonical hostname.

### 1.2 Host (e.g. Vercel)

- In the Vercel project for this app, add the domain **app.ausna.co** (Project → Settings → Domains).
- Ensure production (and preview if desired) use **app.ausna.co** as the primary/production domain.
- After DNS propagates, Vercel will serve the app at `https://app.ausna.co`.

---

## 2. Resend: domains and senders

You already use Resend for the daily activity match from `community@ausna.co`. For auth and app.ausna.co you have two approaches.

### Option A – Reuse root domain (simplest)

- Keep sending auth and transactional emails from **ausna.co** (e.g. `community@ausna.co` or a new sender like `Ausna <noreply@ausna.co>`).
- No new Resend domain; ensure **ausna.co** is verified and SPF/DKIM/DMARC are set.
- All links in emails will point to **app.ausna.co** once you set `NEXT_PUBLIC_SITE_URL` (see below).

### Option B – Subdomain for auth (recommended for reputation)

- In [Resend → Domains](https://resend.com/domains), add **app.ausna.co** (or a dedicated auth subdomain like **auth.ausna.co**).
- Add the DNS records Resend shows (SPF, DKIM, etc.) for that domain.
- Create a sender in Resend, e.g. **Ausna <noreply@app.ausna.co>** (or `auth@app.ausna.co`).
- Use this sender as the “From” for Supabase auth emails (see below).  
  Your existing **community@ausna.co** can stay for daily match and other product emails.

---

## 3. Supabase: custom SMTP (Resend) for auth emails

This makes Supabase send **all** auth emails (confirm signup, reset password, magic link, **and** `inviteUserByEmail` contact invites) via Resend.

### 3.1 Resend SMTP credentials

- **Host:** `smtp.resend.com`
- **Port:** `587` (STARTTLS) or `465` (SSL)
- **Username:** `resend`
- **Password:** your Resend API key (same as `RESEND_API_KEY` or a dedicated key for auth)

Ref: [Resend – Send with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp).

### 3.2 Supabase Dashboard

1. Open your project → **Authentication** → **SMTP Settings** (or [Auth → SMTP](https://supabase.com/dashboard/project/_/auth/smtp)).
2. Enable **Custom SMTP**.
3. Fill in:
   - **Sender email:** e.g. `noreply@app.ausna.co` (Option B) or `noreply@ausna.co` (Option A).
   - **Sender name:** e.g. `Ausna`
   - **Host:** `smtp.resend.com`
   - **Port:** `587` (or `465`)
   - **Username:** `resend`
   - **Password:** Resend API key
4. Save.

After this, Supabase will send auth and invite emails through Resend; no code change is required for the “from” address or delivery.

### 3.3 Supabase URL configuration and redirect URLs

**Do redirect URLs need to be changed?**

**Yes — you must add app.ausna.co to the allowed Redirect URLs** if any link in your emails will send users to app.ausna.co. Supabase only redirects to URLs that are explicitly allowed. So when a user clicks “Reset password” or “Accept invite” in an email, the redirect target (e.g. `https://app.ausna.co/reset-password`) must appear in the Redirect URLs list. Matching the subdomain isn’t just good practice; it’s required for that flow to work.

You do **not** have to remove the main domain (e.g. `https://ausna.co/**`) if you still use it for in-app redirects or as the main app. You can have both: e.g. `https://ausna.co/**` and `https://app.ausna.co/**`.

**If app.ausna.co is used only for email communication** (main app stays at ausna.co):

1. **Authentication** → **URL Configuration**.
2. **Site URL:** can stay as your main app (e.g. `https://ausna.co`) if that’s where users usually land.
3. **Redirect URLs:** **add** (do not necessarily replace) all app.ausna.co paths that appear in emails:
   - `https://app.ausna.co/**`
   - `https://app.ausna.co/auth/callback`
   - `https://app.ausna.co/reset-password`
   - `https://app.ausna.co/invite/*`
   - Keep existing entries for your main domain and localhost (e.g. `https://ausna.co/**`, `http://localhost:3000/**`).

**If the whole app is served at app.ausna.co** (single domain):

1. Set **Site URL** to `https://app.ausna.co`.
2. **Redirect URLs:** include the list above; you can drop the main domain if you no longer use it.

---

## 4. App environment and “update activity” emails

### 4.1 Two scenarios

**Scenario A – App and emails both use app.ausna.co**

Set in production:

```env
NEXT_PUBLIC_SITE_URL=https://app.ausna.co
```

Then every place that uses `getSiteUrl()` (daily match, unsubscribe, invite link, password reset redirect, etc.) will use app.ausna.co. No code change.

**Scenario B – app.ausna.co only for email communication (main app stays at ausna.co)**

Keep `NEXT_PUBLIC_SITE_URL` as your main app (e.g. `https://ausna.co`). Add a separate base URL used **only** when building links that go in emails or when calling auth APIs that send emails (e.g. `redirectTo` for reset password and invite):

```env
NEXT_PUBLIC_SITE_URL=https://ausna.co
# Used only for links in emails and for auth redirectTo in those flows
NEXT_PUBLIC_EMAIL_SITE_URL=https://app.ausna.co
```

Then you need a small code change: introduce a helper (e.g. `getEmailSiteUrl()`) that reads `NEXT_PUBLIC_EMAIL_SITE_URL` and falls back to `getSiteUrl()`, and use it in:

- `lib/email/resend.ts` — `getSiteUrl()` used by daily match, unsubscribe route (so email links and “Back to Ausna” use app.ausna.co)
- Cron and explore actions that build `exploreUrl` / `unsubscribeUrl` for the daily email
- `app/api/contacts/invite/route.ts` — `inviteLink` and `redirectTo` for `inviteUserByEmail`
- `components/auth/ForgotPasswordForm.tsx` — `redirectTo` for `resetPasswordForEmail`

Supabase Redirect URLs must still include `https://app.ausna.co/**` (and the specific paths above) so that when the user clicks the link in the email, Supabase is allowed to redirect there.

### 4.2 Where the app uses the base URL

The app uses `getSiteUrl()` (or, in Scenario B, `getEmailSiteUrl()` for email flows) in:

- Daily activity match email (explore link, unsubscribe link)
- Unsubscribe confirmation page (“Back to Ausna”)
- Contact invite link (`/invite/<token>`) and Supabase `redirectTo`
- Password reset `redirectTo`
- Auth callback and other redirects that use the same env

### 4.3 Optional: separate “from” for daily match

If you use Option B in section 2 and send auth from `noreply@app.ausna.co`, you can keep daily match and other product emails from `community@ausna.co` by leaving `RESEND_FROM_EMAIL` as is. No change required unless you want to move those to a different sender (e.g. `updates@app.ausna.co`).

---

## 5. Checklist summary

| Step | Action |
|------|--------|
| 1 | Add DNS record for **app.ausna.co** (CNAME or A). |
| 2 | Add **app.ausna.co** to Vercel (or your host) and confirm HTTPS. |
| 3 | (Optional) Add and verify **app.ausna.co** (or auth subdomain) in Resend; create sender e.g. `noreply@app.ausna.co`. |
| 4 | In Supabase: enable Custom SMTP with Resend (host, port, user, API key, sender address/name). |
| 5 | In Supabase: set **Site URL** to `https://app.ausna.co` and add all needed **Redirect URLs** for app.ausna.co and localhost. |
| 6 | Set **NEXT_PUBLIC_SITE_URL=https://app.ausna.co** in production (and staging) env. |
| 7 | Test: sign up, reset password, contact invite, daily match email; confirm links use app.ausna.co and emails send via Resend. |

---

## 6. Optional: Resend integration (alternative to manual SMTP)

Resend has a [Supabase integration](https://resend.com/settings/integrations) that can configure SMTP for you:

1. In Resend: **Settings** → **Integrations** → Supabase → select project and domain, create API key, “Configure SMTP” → “Connect to Supabase”.
2. Then in Supabase, confirm SMTP is set (Resend may pre-fill it) and still set **Site URL** and **Redirect URLs** to **app.ausna.co** as in section 3.3.

---

## 7. References

- [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend: Send with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)
- [Resend: Getting started with Resend and Supabase](https://resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase)
- Project: `PASSWORD_RECOVERY_SETUP.md`, `docs/daily-activity-match-email.md`
