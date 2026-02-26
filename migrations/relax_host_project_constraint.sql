-- Migration: relax host_project_id constraint for activities

-- Drop old constraint if it exists
ALTER TABLE portfolios
DROP CONSTRAINT IF EXISTS portfolios_host_project_id_activities_only;

-- New constraint: non-activity portfolios must NOT have a host_project_id;
-- activities may have host_project_id NULL or set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'portfolios_host_project_id_non_activities_null'
      AND conrelid = 'public.portfolios'::regclass
  ) THEN
    ALTER TABLE portfolios
    ADD CONSTRAINT portfolios_host_project_id_non_activities_null
    CHECK (
      (type <> 'activities' AND host_project_id IS NULL)
      OR type = 'activities'
    );
  END IF;
END $$;

