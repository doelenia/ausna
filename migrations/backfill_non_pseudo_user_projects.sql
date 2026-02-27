-- Migration: Backfill pseudo projects for non-pseudo humans
-- Goal: ensure that any user who already has at least one non-pseudo human
--       portfolio also has all of their owned project portfolios marked as
--       non-pseudo (is_pseudo = false).

WITH non_pseudo_humans AS (
  SELECT DISTINCT user_id
  FROM public.portfolios
  WHERE type = 'human'
    AND COALESCE(is_pseudo, false) = false
)
UPDATE public.portfolios p
SET is_pseudo = false
FROM non_pseudo_humans h
WHERE p.type = 'projects'
  AND p.user_id = h.user_id
  AND COALESCE(p.is_pseudo, false) = true;

