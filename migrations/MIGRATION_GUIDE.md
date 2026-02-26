# Migration Guide: Profiles to Human Portfolios

## Overview

This migration (now completed in the main project) converted the existing `profiles` table structure to the unified `portfolios` system, where each user has exactly one human portfolio. The `public.profiles` table and its triggers/policies have since been removed; human portfolios are now the sole source of truth for user profiles.

## Migration Steps

### 1. Run the Portfolio Table Migration

First, create the portfolios table and constraints:

```bash
# In Supabase SQL Editor or via CLI
psql -f migrations/create_portfolios_table.sql
```

This creates:
- `portfolios` table with type discriminator
- Unique constraint ensuring one human portfolio per user
- Full-text search indexes
- RLS policies

### 2. Migrate Existing Profiles

Run the migration script to convert existing profiles:

```bash
# In Supabase SQL Editor or via CLI
psql -f migrations/migrate_profiles_to_human_portfolios.sql
```

This script:
- Converts all existing `profiles` records to `human` portfolios
- Creates human portfolios for users without profiles
- Sets up a trigger to auto-create human portfolios for new users

### 3. Verify Migration

Check that all users have human portfolios:

```sql
-- Count users
SELECT COUNT(*) FROM auth.users;

-- Count human portfolios
SELECT COUNT(*) FROM portfolios WHERE type = 'human';

-- These should match (or portfolios should be >= users if you have test data)
```

### 4. Update Application Code

The application code has been updated to:
- Use `ensureHumanPortfolio()` instead of querying `profiles`
- Store profile data in portfolio `metadata` JSONB field
- Access username/handle via `portfolio.slug` (for human portfolios)

### 5. Legacy Notes About the Old Profiles Table

In earlier iterations, you could optionally archive the old `profiles` table after migration. In the current system, this table has already been dropped via migrations executed through Supabase MCP, so no additional manual action is required here.

## Data Mapping

| Old `profiles` Field | New `portfolios` Field | Location |
|---------------------|----------------------|----------|
| `id` | `user_id` | Direct column |
| `username` | `slug` (for human portfolios) | column |
| `full_name` | `metadata.basic.name` (initially) | JSONB |
| `avatar_url` | `metadata.avatar_url` | JSONB |
| `email` | `metadata.email` | JSONB |
| `created_at` | `created_at` | Direct column |
| `updated_at` | `updated_at` | Direct column |

## New Features

### Automatic Human Portfolio Creation

New users automatically get a human portfolio created via database trigger. The portfolio includes:
- Title: User's full name or email username
- Slug: a username-style, globally unique handle (derived from metadata/email) stored in `portfolios.slug`
- Metadata: Username, email, and other profile info

### Helper Functions

Use these TypeScript functions to work with human portfolios:

```typescript
import { ensureHumanPortfolio, getHumanPortfolio, updateHumanPortfolioMetadata } from '@/lib/portfolio/human'

// Get or create human portfolio (ensures it exists)
const portfolio = await ensureHumanPortfolio(userId)

// Get human portfolio (returns null if not found)
const portfolio = await getHumanPortfolio(userId)

// Update metadata
await updateHumanPortfolioMetadata(userId, { username: 'newusername' })
```

## Rollback Plan

If you need to rollback:

1. Restore the `profiles` table from backup
2. Revert code changes to use `profiles` table
3. The `portfolios` table can remain (won't interfere)

## Notes

- The `profiles` table has been fully removed; user identity is represented solely by human portfolios
- Username/handle uniqueness is enforced via `portfolios.slug` for `type = 'human'`
- Human portfolio slugs are generated using a username-style algorithm (email/metadata based) and used as the canonical username/handle (in `portfolios.slug`)
- All existing profile data is preserved in the portfolio `metadata` field (excluding username/full_name, which are now represented via slug and basic.name)





