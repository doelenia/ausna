-- Migration: Use is_pseudo-based human portfolios for approval checks
-- Users are "approved" if they own at least one non-pseudo human portfolio.
-- This keeps the is_current_user_approved() API but changes its implementation
-- to derive approval from the portfolios table instead of auth.users metadata.

CREATE OR REPLACE FUNCTION is_current_user_approved()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.portfolios p
    WHERE p.type = 'human'
      AND p.user_id = auth.uid()
      AND COALESCE(p.is_pseudo, false) = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_current_user_approved() IS
  'User is approved if they own at least one non-pseudo human portfolio (is_pseudo = false).';


