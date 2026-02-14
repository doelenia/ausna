-- Migration: Backfill human portfolio description and properties from approved form submissions
-- This migration extracts description and properties from public_upload_forms.submission_data
-- and updates the corresponding human portfolios (matched by email)
-- Only updates if description/properties are missing or empty to avoid overwriting existing data

-- Step 1: Update human portfolios with description from approved forms
-- Match portfolios by email stored in metadata
UPDATE portfolios p
SET metadata = jsonb_set(
  -- Ensure basic structure exists
  jsonb_set(
    COALESCE(p.metadata, '{}'::jsonb),
    '{basic}',
    COALESCE(p.metadata->'basic', '{}'::jsonb)
  ),
  '{basic,description}',
  to_jsonb(f.submission_data->>'description')
)
FROM public_upload_forms f
WHERE p.type = 'human'
  AND f.status = 'approved'
  AND f.submission_data->>'email' IS NOT NULL
  AND LOWER(TRIM(f.submission_data->>'email')) = LOWER(TRIM(COALESCE(p.metadata->>'email', '')))
  -- Only update if description is missing or empty
  AND (
    p.metadata->'basic'->>'description' IS NULL 
    OR p.metadata->'basic'->>'description' = ''
    OR LENGTH(TRIM(COALESCE(p.metadata->'basic'->>'description', ''))) = 0
  )
  -- Only update if form has a description
  AND f.submission_data->>'description' IS NOT NULL
  AND f.submission_data->>'description' != ''
  AND LENGTH(TRIM(f.submission_data->>'description')) > 0;

-- Step 2: Update human portfolios with properties from approved forms
-- Match portfolios by email stored in metadata
UPDATE portfolios p
SET metadata = jsonb_set(
  COALESCE(p.metadata, '{}'::jsonb),
  '{properties}',
  COALESCE(p.metadata->'properties', '{}'::jsonb) || 
  COALESCE(f.submission_data->'properties', '{}'::jsonb)
)
FROM public_upload_forms f
WHERE p.type = 'human'
  AND f.status = 'approved'
  AND f.submission_data->>'email' IS NOT NULL
  AND LOWER(TRIM(f.submission_data->>'email')) = LOWER(TRIM(COALESCE(p.metadata->>'email', '')))
  -- Only update if form has properties
  AND f.submission_data->'properties' IS NOT NULL
  AND jsonb_typeof(f.submission_data->'properties') = 'object'
  AND f.submission_data->'properties' != '{}'::jsonb;

-- Step 3: Handle cases where email is in auth.users but not in portfolio metadata
-- Find portfolios by matching user_id from auth.users email lookup
UPDATE portfolios p
SET metadata = jsonb_set(
  -- Ensure basic structure exists
  jsonb_set(
    COALESCE(p.metadata, '{}'::jsonb),
    '{basic}',
    COALESCE(p.metadata->'basic', '{}'::jsonb)
  ),
  '{basic,description}',
  to_jsonb(f.submission_data->>'description')
)
FROM public_upload_forms f
INNER JOIN auth.users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(f.submission_data->>'email'))
WHERE p.type = 'human'
  AND p.user_id = u.id
  AND f.status = 'approved'
  AND f.submission_data->>'email' IS NOT NULL
  -- Only update if description is missing or empty
  AND (
    p.metadata->'basic'->>'description' IS NULL 
    OR p.metadata->'basic'->>'description' = ''
    OR LENGTH(TRIM(COALESCE(p.metadata->'basic'->>'description', ''))) = 0
  )
  -- Only update if form has a description
  AND f.submission_data->>'description' IS NOT NULL
  AND f.submission_data->>'description' != ''
  AND LENGTH(TRIM(f.submission_data->>'description')) > 0
  -- Exclude portfolios already updated in Step 1 (where email was in metadata)
  AND (
    p.metadata->>'email' IS NULL 
    OR LOWER(TRIM(p.metadata->>'email')) != LOWER(TRIM(f.submission_data->>'email'))
  );

-- Step 4: Handle properties for cases where email is in auth.users but not in portfolio metadata
UPDATE portfolios p
SET metadata = jsonb_set(
  COALESCE(p.metadata, '{}'::jsonb),
  '{properties}',
  COALESCE(p.metadata->'properties', '{}'::jsonb) || 
  COALESCE(f.submission_data->'properties', '{}'::jsonb)
)
FROM public_upload_forms f
INNER JOIN auth.users u ON LOWER(TRIM(u.email)) = LOWER(TRIM(f.submission_data->>'email'))
WHERE p.type = 'human'
  AND p.user_id = u.id
  AND f.status = 'approved'
  AND f.submission_data->>'email' IS NOT NULL
  -- Only update if form has properties
  AND f.submission_data->'properties' IS NOT NULL
  AND jsonb_typeof(f.submission_data->'properties') = 'object'
  AND f.submission_data->'properties' != '{}'::jsonb
  -- Exclude portfolios already updated in Step 2 (where email was in metadata)
  AND (
    p.metadata->>'email' IS NULL 
    OR LOWER(TRIM(p.metadata->>'email')) != LOWER(TRIM(f.submission_data->>'email'))
  );

