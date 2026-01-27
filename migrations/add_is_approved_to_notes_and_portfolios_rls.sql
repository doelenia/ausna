-- Migration: Require approved users for creating and managing notes and portfolios
-- This builds on is_current_user_blocked() and is_current_user_approved().

-- Update notes RLS policies to require approved and not-blocked users
DROP POLICY IF EXISTS "Notes are viewable by everyone except blocked users" ON notes;
CREATE POLICY "Notes are viewable by everyone except blocked and unapproved users"
  ON notes FOR SELECT
  USING (
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (is_current_user_approved() OR is_current_user_approved() IS NULL)
  );

DROP POLICY IF EXISTS "Users can create their own notes (not blocked)" ON notes;
CREATE POLICY "Users can create their own notes (approved and not blocked)"
  ON notes FOR INSERT
  WITH CHECK (
    auth.uid() = owner_account_id
    AND NOT is_current_user_blocked()
    AND is_current_user_approved()
  );

DROP POLICY IF EXISTS "Users can update their own notes (not blocked)" ON notes;
CREATE POLICY "Users can update their own notes (approved and not blocked)"
  ON notes FOR UPDATE
  USING (
    auth.uid() = owner_account_id
    AND NOT is_current_user_blocked()
    AND is_current_user_approved()
  )
  WITH CHECK (
    auth.uid() = owner_account_id
    AND NOT is_current_user_blocked()
    AND is_current_user_approved()
  );

DROP POLICY IF EXISTS "Users can delete their own notes (not blocked)" ON notes;
CREATE POLICY "Users can delete their own notes (approved and not blocked)"
  ON notes FOR DELETE
  USING (
    auth.uid() = owner_account_id
    AND NOT is_current_user_blocked()
    AND is_current_user_approved()
  );

-- Update portfolios RLS policies to require approved and not-blocked users for writes
DROP POLICY IF EXISTS "Portfolios are viewable by everyone except blocked users" ON portfolios;
CREATE POLICY "Portfolios are viewable by everyone except blocked and unapproved users"
  ON portfolios FOR SELECT
  USING (
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (is_current_user_approved() OR is_current_user_approved() IS NULL)
  );

DROP POLICY IF EXISTS "Users can create their own portfolios (not blocked)" ON portfolios;
CREATE POLICY "Users can create their own portfolios (approved and not blocked)"
  ON portfolios FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT is_current_user_blocked()
    AND is_current_user_approved()
  );

DROP POLICY IF EXISTS "Users can update their own portfolios (not blocked)" ON portfolios;
CREATE POLICY "Users can update their own portfolios (approved and not blocked)"
  ON portfolios FOR UPDATE
  USING (
    auth.uid() = user_id
    AND NOT is_current_user_blocked()
    AND is_current_user_approved()
  )
  WITH CHECK (
    auth.uid() = user_id
    AND NOT is_current_user_blocked()
    AND is_current_user_approved()
  );

DROP POLICY IF EXISTS "Users can delete their own portfolios (not blocked)" ON portfolios;
CREATE POLICY "Users can delete their own portfolios (approved and not blocked)"
  ON portfolios FOR DELETE
  USING (
    auth.uid() = user_id
    AND NOT is_current_user_blocked()
    AND is_current_user_approved()
  );


