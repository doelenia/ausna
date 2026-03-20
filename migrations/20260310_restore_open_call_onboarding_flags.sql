-- Restore open-call onboarding completion for users who already created open calls.
-- This migration merges into metadata.onboarding instead of overwriting it.

WITH users_with_open_calls AS (
  SELECT DISTINCT p.id
  FROM portfolios p
  INNER JOIN notes n
    ON n.owner_account_id = p.user_id
   AND n.type = 'open_call'
   AND n.deleted_at IS NULL
  WHERE p.type = 'human'
)
UPDATE portfolios p
SET metadata = jsonb_set(
  COALESCE(p.metadata, '{}'::jsonb),
  '{onboarding}',
  COALESCE(p.metadata->'onboarding', '{}'::jsonb) || jsonb_build_object(
    'open_calls_setup_complete', true,
    'updated_at', NOW()
  ),
  true
)
FROM users_with_open_calls u
WHERE p.id = u.id
  AND COALESCE((p.metadata->'onboarding'->>'open_calls_setup_complete')::boolean, false) = false;
