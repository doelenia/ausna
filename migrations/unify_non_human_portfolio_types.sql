-- Unify non-human portfolios into canonical DB type = 'portfolio'
-- while preserving human as type = 'human'.
--
-- NOTE:
-- We keep the existing enum type object and rename the 'projects' label to
-- 'portfolio' to avoid disruptive enum replacement across policy dependencies.
--
-- Safe to run once in environments where non-human rows should be unified.

BEGIN;

-- 1) Resolve duplicate slugs before global unique index
WITH duplicate_slugs AS (
  SELECT slug
  FROM portfolios
  GROUP BY slug
  HAVING COUNT(*) > 1
)
UPDATE portfolios p
SET slug = p.slug || '-' || substring(p.id::text, 1, 8)
FROM duplicate_slugs d
WHERE p.slug = d.slug
  AND p.type <> 'human';

-- 2) Preserve legacy host_project_id data in metadata and clear table column
UPDATE portfolios
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{properties,host_project_ids}',
  CASE
    WHEN (COALESCE(metadata, '{}'::jsonb) #> '{properties,host_project_ids}') IS NULL
      THEN to_jsonb(ARRAY[host_project_id::text])
    ELSE (COALESCE(metadata, '{}'::jsonb) #> '{properties,host_project_ids}')
  END,
  true
)
WHERE type = 'activities'
  AND host_project_id IS NOT NULL;

UPDATE portfolios
SET host_project_id = NULL
WHERE type = 'activities' AND host_project_id IS NOT NULL;

-- 3) Collapse all non-human rows to the existing non-human enum label
UPDATE portfolios
SET type = 'projects'
WHERE type <> 'human';

-- 4) Rename enum label projects -> portfolio (row values follow automatically)
ALTER TYPE portfolio_type RENAME VALUE 'projects' TO 'portfolio';

-- 5) Global slug uniqueness + supporting indexes
ALTER TABLE portfolios
  DROP CONSTRAINT IF EXISTS unique_slug_per_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_portfolios_slug
  ON portfolios (slug);

DROP INDEX IF EXISTS idx_portfolios_type;
CREATE INDEX IF NOT EXISTS idx_portfolios_type ON portfolios(type);

DROP INDEX IF EXISTS idx_unique_human_portfolio_per_user;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_human_portfolio_per_user
  ON portfolios(user_id)
  WHERE type = 'human';

COMMIT;

