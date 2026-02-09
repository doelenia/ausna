-- Migration: Convert pinned field from object to array
-- Changes pinned from {} to [] to support array of pinned items

-- Step 1: Convert pinned from empty object {} to empty array []
UPDATE portfolios
SET metadata = jsonb_set(
  metadata,
  '{pinned}',
  '[]'::jsonb
)
WHERE metadata->'pinned' = '{}'::jsonb
   OR metadata->'pinned' IS NULL;

-- Step 2: Ensure pinned is always an array (handle any edge cases)
-- If pinned exists but is not an array, convert it to empty array
UPDATE portfolios
SET metadata = jsonb_set(
  metadata,
  '{pinned}',
  '[]'::jsonb
)
WHERE metadata->'pinned' IS NOT NULL
  AND jsonb_typeof(metadata->'pinned') != 'array';

-- Step 3: Update the comment to reflect the new structure
COMMENT ON COLUMN portfolios.metadata IS 'Portfolio metadata with structure: {basic: {name, description, avatar}, pinned: [{type: "portfolio"|"note", id: string}], settings: {}, members?: [], hosts?: []}';





