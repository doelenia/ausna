-- Migration: Refactor Portfolio Metadata Structure
-- Moves title and description from columns to metadata.basic
-- Adds basic, pinned, and settings structure to all portfolios

-- Step 1: Migrate existing data to new metadata structure
UPDATE portfolios
SET metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        -- Start with existing metadata
        COALESCE(metadata, '{}'::jsonb),
        -- Add basic.name from title
        '{basic,name}',
        to_jsonb(COALESCE(title, 'Untitled'))
      ),
      -- Add basic.description from description
      '{basic,description}',
      to_jsonb(COALESCE(description, ''))
    ),
    -- Add pinned (empty object)
    '{pinned}',
    '{}'::jsonb
  ),
  -- Add settings (empty object)
  '{settings}',
  '{}'::jsonb
)
WHERE metadata->'basic' IS NULL;

-- Step 2: Handle human portfolios - migrate username to basic.name if needed
UPDATE portfolios
SET metadata = jsonb_set(
  metadata,
  '{basic,name}',
  to_jsonb(
    COALESCE(
      metadata->'basic'->>'name',
      metadata->>'username',
      metadata->>'full_name',
      title,
      'User'
    )
  )
)
WHERE type = 'human' 
  AND (metadata->'basic'->>'name' IS NULL OR metadata->'basic'->>'name' = '');

-- Step 3: Migrate avatar_url to basic.avatar for human portfolios
UPDATE portfolios
SET metadata = jsonb_set(
  metadata,
  '{basic,avatar}',
  to_jsonb(COALESCE(metadata->>'avatar_url', ''))
)
WHERE type = 'human' 
  AND metadata->>'avatar_url' IS NOT NULL
  AND (metadata->'basic'->>'avatar' IS NULL OR metadata->'basic'->>'avatar' = '');

-- Step 4: Ensure basic.avatar exists (empty string if not present)
UPDATE portfolios
SET metadata = jsonb_set(
  metadata,
  '{basic,avatar}',
  to_jsonb(COALESCE(metadata->'basic'->>'avatar', ''))
)
WHERE metadata->'basic'->>'avatar' IS NULL;

-- Step 5: For projects and discussions, add members array with owner
UPDATE portfolios
SET metadata = jsonb_set(
  jsonb_set(
    metadata,
    '{members}',
    to_jsonb(ARRAY[user_id]::text[])
  ),
  '{hosts}',
  to_jsonb(COALESCE(ARRAY[]::text[]))
)
WHERE type IN ('projects', 'discussion')
  AND (metadata->>'members' IS NULL OR jsonb_array_length(COALESCE(metadata->'members', '[]'::jsonb)) = 0);

-- Step 6: Ensure projects and discussions have hosts array (empty if not present)
UPDATE portfolios
SET metadata = jsonb_set(
  metadata,
  '{hosts}',
  to_jsonb(COALESCE(metadata->'hosts', '[]'::jsonb))
)
WHERE type IN ('projects', 'discussion')
  AND metadata->>'hosts' IS NULL;

-- Step 7: Drop the old full-text search index
DROP INDEX IF EXISTS idx_portfolios_search;

-- Step 8: Recreate full-text search index using metadata.basic.name
CREATE INDEX idx_portfolios_search ON portfolios USING GIN(
  to_tsvector('english', 
    coalesce(metadata->'basic'->>'name', '') || ' ' || 
    coalesce(metadata->'basic'->>'description', '') || ' ' || 
    coalesce(metadata::text, '')
  )
);

-- Step 9: Drop title and description columns
ALTER TABLE portfolios DROP COLUMN IF EXISTS title;
ALTER TABLE portfolios DROP COLUMN IF EXISTS description;

-- Step 10: Add comment explaining the new structure
COMMENT ON COLUMN portfolios.metadata IS 'Portfolio metadata with structure: {basic: {name, description, avatar}, pinned: {}, settings: {}, members?: [], hosts?: []}';

