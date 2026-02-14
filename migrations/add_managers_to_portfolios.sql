-- Migration: Add managers array and remove hosts field from project/community portfolios
-- This migration implements the new role-based member structure:
-- - Creator (user_id): Can delete and do everything
-- - Manager (metadata.managers): Can edit, manage pinned, etc. (everything except delete)
-- - Member (metadata.members): Can only post notes

-- Step 1: Add managers array to existing project/community portfolios
-- Initialize managers array with creator's user_id (creator is automatically a manager)
UPDATE portfolios
SET metadata = jsonb_set(
  metadata,
  '{managers}',
  to_jsonb(ARRAY[user_id]::text[])
)
WHERE type IN ('projects', 'community')
  AND (metadata->>'managers' IS NULL OR jsonb_array_length(COALESCE(metadata->'managers', '[]'::jsonb)) = 0);

-- Step 2: Ensure managers array exists even if it was already set (safety check)
UPDATE portfolios
SET metadata = jsonb_set(
  metadata,
  '{managers}',
  to_jsonb(COALESCE(metadata->'managers', ARRAY[user_id]::text[]))
)
WHERE type IN ('projects', 'community')
  AND metadata->>'managers' IS NULL;

-- Step 3: Remove hosts field from all project/community portfolios
UPDATE portfolios
SET metadata = metadata - 'hosts'
WHERE type IN ('projects', 'community')
  AND metadata ? 'hosts';

-- Step 4: Update comment explaining the new structure
COMMENT ON COLUMN portfolios.metadata IS 'Portfolio metadata with structure: {basic: {name, description, avatar}, pinned: [{type: "portfolio"|"note", id: string}], settings: {}, members?: [], managers?: []}. For projects/communities: members (user IDs), managers (user IDs). Creator is portfolio.user_id.';





