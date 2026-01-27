-- Migration: Add is_approved flag in auth.users metadata and helper function
-- This introduces a helper to check if the current user is approved and
-- backfills is_approved = true for users with at least one non-pseudo
-- human portfolio.

-- Helper function to check if current user is approved
CREATE OR REPLACE FUNCTION is_current_user_approved()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND COALESCE((raw_user_meta_data->>'is_approved')::boolean, false) = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_current_user_approved() IS
  'Check if the current authenticated user is approved based on raw_user_meta_data->>is_approved flag';

-- Backfill: mark users as approved if they own at least one non-pseudo human portfolio
UPDATE auth.users u
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('is_approved', true)
FROM public.portfolios p
WHERE p.type = 'human'
  AND p.is_pseudo = false
  AND p.user_id = u.id;

-- Backfill: mark human portfolios as approved in their metadata for non-pseudo owners
UPDATE public.portfolios p
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('is_approved', true)
WHERE p.type = 'human'
  AND p.is_pseudo = false;


