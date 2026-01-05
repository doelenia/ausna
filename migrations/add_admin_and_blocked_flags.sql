-- Migration: Add admin and blocked flags to auth.users metadata
-- This migration sets admin status for specified emails and adds support for blocking users

-- Step 1: Set admin flag for specified admin emails
-- Note: This uses Supabase's auth.users table which we can update via service role
-- The actual update will be done via a function that can be called with service role

-- Create function to set admin status (to be called with service role)
CREATE OR REPLACE FUNCTION set_admin_users()
RETURNS void AS $$
DECLARE
  admin_emails TEXT[] := ARRAY['allen@doelenia.com', 'ceciliayiyan@gmail.com'];
  email TEXT;
BEGIN
  -- Update each admin email to have is_admin flag
  FOREACH email IN ARRAY admin_emails
  LOOP
    -- Note: Direct update of auth.users requires service role
    -- This function should be called with service role privileges
    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || 
        jsonb_build_object('is_admin', true)
    WHERE email = email;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Create helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = user_id
    AND (raw_user_meta_data->>'is_admin')::boolean = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create helper function to check if user is blocked
CREATE OR REPLACE FUNCTION is_blocked(user_id UUID)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = user_id
    AND (raw_user_meta_data->>'is_blocked')::boolean = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Add comment explaining the metadata structure
COMMENT ON FUNCTION is_admin(UUID) IS 'Check if a user is an admin based on email whitelist';
COMMENT ON FUNCTION is_blocked(UUID) IS 'Check if a user is blocked from accessing the platform';

-- Note: The actual admin flag setting will be done via Supabase Admin API or service role
-- This migration provides the functions and structure needed


