-- Unify non-human portfolio types into a single discriminator value.
--
-- After this migration:
-- - portfolios.type is either 'human' or 'portfolio'
-- - all previously non-human rows (projects/community/activities) become 'portfolio'
-- - slug uniqueness becomes global (not scoped by type)
-- - one-human-portfolio-per-user is preserved via a partial unique index on type='human'
--
-- IMPORTANT: deploy the corresponding app code in the same release.

BEGIN;

-- 1) Replace type-scoped slug uniqueness with global slug uniqueness
ALTER TABLE portfolios
  DROP CONSTRAINT IF EXISTS unique_slug_per_type;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_unique_portfolios_slug'
  ) THEN
    CREATE UNIQUE INDEX idx_unique_portfolios_slug ON portfolios (slug);
  END IF;
END $$;

-- 2) Create a new enum with only the allowed values
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portfolio_type_new') THEN
    DROP TYPE portfolio_type_new;
  END IF;
END $$;

CREATE TYPE portfolio_type_new AS ENUM ('human', 'portfolio');

-- 3) Move all non-human rows to the unified type
UPDATE portfolios
SET type = 'projects'
WHERE type IS NULL;

UPDATE portfolios
SET type = 'projects'
WHERE type NOT IN ('human', 'projects', 'community', 'activities');

UPDATE portfolios
SET type = 'projects'
WHERE type = 'portfolio';

UPDATE portfolios
SET type = 'projects'
WHERE type = 'portfolios';

UPDATE portfolios
SET type = 'projects'
WHERE type = 'project';

UPDATE portfolios
SET type = 'projects'
WHERE type = 'communitys';

-- Canonical consolidation: everything non-human becomes 'portfolio'
UPDATE portfolios
SET type = 'portfolio'
WHERE type <> 'human';

-- 4) Alter the column to the new enum
ALTER TABLE portfolios
  ALTER COLUMN type TYPE portfolio_type_new
  USING (type::text::portfolio_type_new);

-- 5) Swap enum types
DROP TYPE IF EXISTS portfolio_type;
ALTER TYPE portfolio_type_new RENAME TO portfolio_type;

-- 6) Fix dependent indexes
DROP INDEX IF EXISTS idx_portfolios_type;
CREATE INDEX IF NOT EXISTS idx_portfolios_type ON portfolios(type);

DROP INDEX IF EXISTS idx_unique_human_portfolio_per_user;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_human_portfolio_per_user
  ON portfolios(user_id)
  WHERE type = 'human';

COMMIT;

