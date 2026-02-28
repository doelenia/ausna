-- Backfill metadata.onboarding on human portfolios for existing users.
-- Run after deploying onboarding feature. No new table; only updates portfolios.metadata.

-- profile_complete: true if basic.name, basic.description, and basic.avatar are all non-empty (trimmed).
-- availabilities_complete: true if properties.availability_schedule has at least one day with enabled = true.
-- join_community_seen: true if this user is already owner or member of at least one community; false otherwise.

WITH human_portfolios AS (
  SELECT id, user_id, metadata
  FROM portfolios
  WHERE type = 'human'
),
computed AS (
  SELECT
    hp.id,
    hp.user_id,
    hp.metadata,
    -- profile_complete: all three fields non-empty
    (
      trim(COALESCE(hp.metadata->'basic'->>'name', '')) <> ''
      AND trim(COALESCE(hp.metadata->'basic'->>'description', '')) <> ''
      AND trim(COALESCE(hp.metadata->'basic'->>'avatar', '')) <> ''
    ) AS profile_complete,
    -- availabilities_complete: at least one day enabled
    (
      (hp.metadata->'properties'->'availability_schedule'->'monday'->>'enabled') = 'true'
      OR (hp.metadata->'properties'->'availability_schedule'->'tuesday'->>'enabled') = 'true'
      OR (hp.metadata->'properties'->'availability_schedule'->'wednesday'->>'enabled') = 'true'
      OR (hp.metadata->'properties'->'availability_schedule'->'thursday'->>'enabled') = 'true'
      OR (hp.metadata->'properties'->'availability_schedule'->'friday'->>'enabled') = 'true'
      OR (hp.metadata->'properties'->'availability_schedule'->'saturday'->>'enabled') = 'true'
      OR (hp.metadata->'properties'->'availability_schedule'->'sunday'->>'enabled') = 'true'
    ) AS availabilities_complete,
    -- join_community_seen: user is owner or in members of some community
    EXISTS (
      SELECT 1
      FROM portfolios c
      WHERE c.type = 'community'
        AND (c.user_id = hp.user_id OR (c.metadata->'members') @> to_jsonb(ARRAY[hp.user_id::text])::jsonb)
    ) AS join_community_seen
  FROM human_portfolios hp
)
UPDATE portfolios p
SET metadata = jsonb_set(
  COALESCE(p.metadata, '{}'::jsonb),
  '{onboarding}',
  jsonb_build_object(
    'profile_complete', COALESCE(c.profile_complete, false),
    'availabilities_complete', COALESCE(c.availabilities_complete, false),
    'join_community_seen', COALESCE(c.join_community_seen, false)
  )
)
FROM computed c
WHERE p.id = c.id
  AND p.type = 'human';
