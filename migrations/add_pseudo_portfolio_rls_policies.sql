-- Migration: Add RLS policies to exclude pseudo portfolios from customer view
-- Pseudo portfolios are only visible to admins

-- Helper function to check if current user is admin
-- Follows the same pattern as is_current_user_blocked() and is_admin(user_id UUID)
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (raw_user_meta_data->>'is_admin')::boolean = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update SELECT policy to exclude pseudo portfolios for non-admins
DROP POLICY IF EXISTS "Portfolios are viewable by everyone except blocked users" ON portfolios;

CREATE POLICY "Portfolios are viewable by everyone except blocked users and pseudo portfolios"
  ON portfolios FOR SELECT
  USING (
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (
      is_pseudo = false 
      OR is_current_user_admin()
    )
  );

-- Add comment
COMMENT ON FUNCTION is_current_user_admin() IS 
  'Check if the current authenticated user is an admin (based on raw_user_meta_data->>is_admin flag)';



