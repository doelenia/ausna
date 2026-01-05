# Migration Guide: Profiles to Human Portfolios

## Overview

This migration converts the existing `profiles` table structure to the new unified `portfolios` system, where each user has exactly one human portfolio.

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
- Access username via `portfolio.metadata.username`

### 5. (Optional) Archive Old Profiles Table

After verifying everything works, you can optionally archive the old profiles table:

```sql
-- Rename old table (don't delete yet, keep as backup)
ALTER TABLE profiles RENAME TO profiles_archived;

-- Or if you're confident, drop it:
-- DROP TABLE profiles;
```

## Data Mapping

| Old `profiles` Field | New `portfolios` Field | Location |
|---------------------|----------------------|----------|
| `id` | `user_id` | Direct column |
| `username` | `metadata.username` | JSONB |
| `full_name` | `metadata.full_name` | JSONB |
| `avatar_url` | `metadata.avatar_url` | JSONB |
| `email` | `metadata.email` | JSONB |
| `created_at` | `created_at` | Direct column |
| `updated_at` | `updated_at` | Direct column |

## New Features

### Automatic Human Portfolio Creation

New users automatically get a human portfolio created via database trigger. The portfolio includes:
- Title: User's full name or email username
- Slug: `user-{user_id}`
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

- The `profiles` table structure is preserved in the migration for compatibility
- Username uniqueness is now checked across all human portfolios
- The human portfolio slug is auto-generated as `user-{user_id}` but can be customized
- All existing profile data is preserved in the portfolio `metadata` field


