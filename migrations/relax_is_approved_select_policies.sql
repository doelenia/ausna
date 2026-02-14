-- Migration: Relax SELECT policies to not depend on is_approved
-- Viewing notes/portfolios should be allowed for unapproved/anonymous users.
-- Writes (INSERT/UPDATE/DELETE) still require is_current_user_approved().

-- Restore notes SELECT policy to only exclude blocked users
DROP POLICY IF EXISTS "Notes are viewable by everyone except blocked and unapproved users" ON notes;

CREATE POLICY "Notes are viewable by everyone except blocked users"
  ON notes FOR SELECT
  USING (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL);

-- Restore portfolios SELECT policy to exclude blocked users and pseudo portfolios,
-- matching add_pseudo_portfolio_rls_policies.sql but without is_approved checks.
DROP POLICY IF EXISTS "Portfolios are viewable by everyone except blocked and unapproved users" ON portfolios;

CREATE POLICY "Portfolios are viewable by everyone except blocked users and pseudo portfolios"
  ON portfolios FOR SELECT
  USING (
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (
      is_pseudo = false 
      OR is_current_user_admin()
    )
  );




