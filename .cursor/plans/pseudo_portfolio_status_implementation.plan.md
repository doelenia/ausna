# Pseudo Portfolio Status Implementation Plan

## Overview

Add a `is_pseudo` status to portfolios that makes them hidden from customer-facing search while remaining visible in the admin portal. This will eventually support general mode & admin mode in search functionality.

## Current State Analysis

### Database Structure

- **portfolios table** has:
- `id` (uuid)
- `type` (portfolio_type enum: 'human', 'projects', 'community')
- `slug` (text)
- `user_id` (uuid)
- `created_at`, `updated_at` (timestamptz)
- `metadata` (jsonb)

### Current RLS Policies

- **SELECT Policy**: "Portfolios are viewable by everyone except blocked users"
- Condition: `(NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)`
- This allows all non-blocked users to see all portfolios

### Search Implementation

1. **Customer Search** (`/app/api/portfolios/search/route.ts`):

- Public endpoint (no authentication required)
- Fetches all portfolios and filters in JavaScript
- Returns portfolios matching search query

2. **Admin Search** (`/app/admin/actions.ts` - `searchPortfolios()`):

- Requires admin authentication
- Searches projects/community portfolios
- Currently shows all portfolios (no pseudo filtering)

### Admin Detection

- Admin status stored in: `auth.users.raw_user_meta_data->>'is_admin'`
- Helper function: `is_admin(user_id UUID)` exists

## Implementation Plan

### Phase 1: Database Schema Changes

#### 1.1 Add `is_pseudo` Column

**Migration**: `migrations/add_pseudo_status_to_portfolios.sql`

```sql
-- Add is_pseudo column to portfolios table
ALTER TABLE portfolios 
ADD COLUMN is_pseudo BOOLEAN NOT NULL DEFAULT false;

-- Add index for performance (filtering pseudo portfolios)
CREATE INDEX idx_portfolios_is_pseudo ON portfolios(is_pseudo) 
WHERE is_pseudo = true;

-- Add comment
COMMENT ON COLUMN portfolios.is_pseudo IS 
  'If true, portfolio is hidden from customer search but visible to admins';
```

**Rationale**:

- Default `false` ensures existing portfolios remain visible
- Index on `is_pseudo = true` optimizes queries filtering pseudo portfolios
- Boolean is simple and efficient

#### 1.2 Update RLS Policies

**Migration**: `migrations/add_pseudo_portfolio_rls_policies.sql`

```sql
-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (raw_user_meta_data->>'is_admin')::boolean = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update SELECT policy to exclude pseudo portfolios for non-admins
DROP POLICY IF EXISTS "Portfolios are viewable by everyone except blocked users" ON portfolios;

CREATE POLICY "Portfolios are viewable by everyone except blocked users and pseudo portfolios"
  ON portfolios FOR SELECT
  USING (
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (
      is_pseudo = false 
      OR is_current_user_admin()
    )
  );

-- Add comment
COMMENT ON FUNCTION is_current_user_admin() IS 
  'Check if the current authenticated user is an admin (based on raw_user_meta_data->>is_admin flag)';
```

**Rationale**:

- Follows existing pattern: `is_admin(user_id UUID)` exists, this is the current-user version
- Matches the pattern of `is_current_user_blocked()` function
- RLS automatically filters pseudo portfolios for non-admins at database level
- Admins can see all portfolios including pseudo ones
- Uses `raw_user_meta_data->>'is_admin'` flag (same as existing `is_admin()` function)

### Phase 2: Search API Updates

#### 2.1 Update Customer Search API

**File**: `app/api/portfolios/search/route.ts`**Changes**:

1. The RLS policy will automatically filter out pseudo portfolios, but we should add explicit filtering as a safety measure
2. No changes needed if RLS is working correctly, but add a comment explaining the behavior

**Current behavior** (after RLS update):

- Non-admin users: Only see portfolios where `is_pseudo = false`
- Admin users: See all portfolios including pseudo ones

**Note**: Since the endpoint uses `createClient()` which respects RLS, the filtering happens automatically. We may want to add explicit filtering for clarity:

```typescript
// After fetching portfolios, explicitly filter pseudo (defensive programming)
// Note: RLS should already filter this, but we add it as a safety measure
if (!user || !isAdmin) {
  portfolios = portfolios.filter((p: any) => !p.is_pseudo)
}
```

However, we need to check admin status. Let's keep it simple and rely on RLS.

#### 2.2 Update Admin Search Function

**File**: `app/admin/actions.ts` - `searchPortfolios()`**Changes**:

- No changes needed - admin search already uses `requireAdmin()` which ensures admin access
- RLS will allow admins to see pseudo portfolios automatically
- Consider adding a filter option to show only pseudo portfolios (future enhancement)

### Phase 3: TypeScript Type Updates

#### 3.1 Update Portfolio Types

**File**: `types/portfolio.ts`**Changes**:

```typescript
export interface BasePortfolio {
  id: string
  type: PortfolioType
  slug: string
  user_id: string
  created_at: string
  updated_at: string
  metadata: Json
  is_pseudo?: boolean // Add optional field (defaults to false in DB)
}
```

**Rationale**:

- Optional field since existing code may not expect it
- Defaults to `false` in database, so existing portfolios work fine

### Phase 4: Admin Portal Updates

#### 4.1 Add Pseudo Status Toggle

**File**: `components/admin/ProjectsTab.tsx` or similar**Future Enhancement**:

- Add a toggle/checkbox to mark portfolios as pseudo
- Add filter to show only pseudo portfolios
- Display visual indicator for pseudo portfolios

**Note**: This can be done in a separate PR after the core functionality is in place.

### Phase 5: Future Enhancements (General Mode & Admin Mode)

#### 5.1 Search Mode Parameter

**Future API Design**:

```typescript
// Customer search (default)
GET /api/portfolios/search?q=query&mode=general

// Admin search (requires auth)
GET /api/portfolios/search?q=query&mode=admin
```

**Implementation**:

1. Add `mode` query parameter to search endpoint
2. Validate admin status when `mode=admin`
3. Filter pseudo portfolios based on mode:

- `general`: Exclude pseudo portfolios
- `admin`: Include all portfolios (requires admin auth)

## Migration Order

1. **Step 1**: Add `is_pseudo` column (Phase 1.1)
2. **Step 2**: Update RLS policies (Phase 1.2)
3. **Step 3**: Update TypeScript types (Phase 3.1)
4. **Step 4**: Test customer search (should exclude pseudo)
5. **Step 5**: Test admin search (should include pseudo)
6. **Step 6**: Add admin UI for managing pseudo status (Phase 4.1) - separate PR

## Testing Checklist

### Database Tests

- [ ] Verify `is_pseudo` column exists with default `false`
- [ ] Verify index exists on `is_pseudo`
- [ ] Verify RLS policy excludes pseudo portfolios for non-admins
- [ ] Verify RLS policy includes pseudo portfolios for admins

### API Tests

- [ ] Customer search excludes pseudo portfolios
- [ ] Admin search includes pseudo portfolios
- [ ] Setting `is_pseudo = true` hides portfolio from customer search
- [ ] Setting `is_pseudo = false` shows portfolio in customer search

### Edge Cases

- [ ] Unauthenticated users cannot see pseudo portfolios
- [ ] Non-admin authenticated users cannot see pseudo portfolios
- [ ] Admin users can see pseudo portfolios
- [ ] Existing portfolios (is_pseudo = false) continue to work normally

## Security Considerations

1. **RLS Enforcement**: RLS policies ensure database-level filtering, preventing bypass
2. **Admin Verification**: Admin status checked via `is_current_user_admin()` function
3. **Service Client**: Admin operations should use service client when needed (already done in admin actions)

## Rollback Plan

If issues arise:

1. Set all `is_pseudo = false` to restore previous behavior
2. Revert RLS policy changes
3. Drop `is_pseudo` column if needed

## Notes

- The RLS approach is preferred over application-level filtering for security
- Admin UI for managing pseudo status can be added in a follow-up PR
- Future "mode" parameter can be added without breaking changes