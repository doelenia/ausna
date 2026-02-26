-- Migration: add host_project_id to portfolios for activities

ALTER TABLE portfolios
ADD COLUMN IF NOT EXISTS host_project_id UUID REFERENCES portfolios(id);

-- Index to speed up lookups of activities for a given host project
CREATE INDEX IF NOT EXISTS idx_portfolios_type_host_project
  ON portfolios (type, host_project_id);

-- Check constraint to ensure only activities have a host_project_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'portfolios_host_project_id_activities_only'
      AND conrelid = 'public.portfolios'::regclass
  ) THEN
    ALTER TABLE portfolios
    ADD CONSTRAINT portfolios_host_project_id_activities_only
    CHECK (
      (type = 'activities' AND host_project_id IS NOT NULL)
      OR (type <> 'activities' AND host_project_id IS NULL)
    );
  END IF;
END $$;

