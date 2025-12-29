# Ausna

A community for creators to mobilize their network for their creative projects.

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
# Recommended: Use publishable key (new format, better security)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
# OR use legacy anon key (still supported but not recommended)
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

### 3. Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Get your project URL and API keys from the project settings:
   - **Recommended**: Use the publishable key (`sb_publishable_...`) from Settings > API Keys
   - **Legacy**: The anon key (JWT-based) still works but is being phased out
3. Configure OAuth providers (Google, Apple) in the Supabase dashboard:
   - Go to Authentication > Providers
   - Enable Google and Apple providers
   - Add your OAuth credentials

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `/app` - Next.js App Router pages and routes
- `/components` - Reusable React components
- `/lib` - Utility libraries (Supabase, OpenAI clients)
- `/types` - TypeScript type definitions
- `/middleware.ts` - Next.js middleware for auth session management

## Features Implemented

- ✅ Email/password authentication
- ✅ OAuth authentication (Google, Apple)
- ✅ User account page at `/account/[id]`
- ✅ Root route redirects to `/main`
- ✅ Supabase client setup (browser & server)
- ✅ OpenAI API client setup
- ✅ Protected routes with middleware
- ✅ Session management

## Next Steps

- Set up your Supabase database schema (profiles table, etc.)
- Configure OAuth providers in Supabase dashboard
- Add your API keys to `.env.local`
- Start building your social media features!
