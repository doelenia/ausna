-- Migration: Add RLS policies to respect blocked user status
-- This prevents blocked users from accessing the platform

-- Helper function to check if current user is blocked
CREATE OR REPLACE FUNCTION is_current_user_blocked()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (raw_user_meta_data->>'is_blocked')::boolean = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update notes RLS policies to exclude blocked users
DROP POLICY IF EXISTS "Notes are viewable by everyone" ON notes;
CREATE POLICY "Notes are viewable by everyone except blocked users"
  ON notes FOR SELECT
  USING (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL);

DROP POLICY IF EXISTS "Users can create their own notes" ON notes;
CREATE POLICY "Users can create their own notes (not blocked)"
  ON notes FOR INSERT
  WITH CHECK (
    auth.uid() = owner_account_id 
    AND NOT is_current_user_blocked()
  );

DROP POLICY IF EXISTS "Users can update their own notes" ON notes;
CREATE POLICY "Users can update their own notes (not blocked)"
  ON notes FOR UPDATE
  USING (
    auth.uid() = owner_account_id 
    AND NOT is_current_user_blocked()
  )
  WITH CHECK (
    auth.uid() = owner_account_id 
    AND NOT is_current_user_blocked()
  );

DROP POLICY IF EXISTS "Users can delete their own notes" ON notes;
CREATE POLICY "Users can delete their own notes (not blocked)"
  ON notes FOR DELETE
  USING (
    auth.uid() = owner_account_id 
    AND NOT is_current_user_blocked()
  );

-- Update portfolios RLS policies to exclude blocked users
DROP POLICY IF EXISTS "Portfolios are viewable by everyone" ON portfolios;
CREATE POLICY "Portfolios are viewable by everyone except blocked users"
  ON portfolios FOR SELECT
  USING (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL);

DROP POLICY IF EXISTS "Users can create their own portfolios" ON portfolios;
CREATE POLICY "Users can create their own portfolios (not blocked)"
  ON portfolios FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    AND NOT is_current_user_blocked()
  );

DROP POLICY IF EXISTS "Users can update their own portfolios" ON portfolios;
CREATE POLICY "Users can update their own portfolios (not blocked)"
  ON portfolios FOR UPDATE
  USING (
    auth.uid() = user_id 
    AND NOT is_current_user_blocked()
  )
  WITH CHECK (
    auth.uid() = user_id 
    AND NOT is_current_user_blocked()
  );

DROP POLICY IF EXISTS "Users can delete their own portfolios" ON portfolios;
CREATE POLICY "Users can delete their own portfolios (not blocked)"
  ON portfolios FOR DELETE
  USING (
    auth.uid() = user_id 
    AND NOT is_current_user_blocked()
  );

-- Add comment
COMMENT ON FUNCTION is_current_user_blocked() IS 'Check if the current authenticated user is blocked from accessing the platform';



