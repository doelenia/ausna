-- Fix the trigger function to use the new metadata structure
-- The title column was removed in refactor_portfolio_metadata.sql
-- This updates the trigger to use metadata.basic.name instead

CREATE OR REPLACE FUNCTION create_human_portfolio_for_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  user_meta JSONB;
  default_username TEXT;
  default_name TEXT;
BEGIN
  user_email := NEW.email;
  user_meta := NEW.raw_user_meta_data;
  
  -- Generate default username from email
  default_username := SPLIT_PART(user_email, '@', 1);
  
  -- Generate default name from metadata or email
  default_name := COALESCE(
    (user_meta->>'full_name')::text,
    (user_meta->>'name')::text,
    default_username,
    'User'
  );
  
  -- Create human portfolio for new user (only if it doesn't exist)
  -- Check first to avoid conflicts with the unique index
  IF NOT EXISTS (
    SELECT 1 FROM portfolios 
    WHERE user_id = NEW.id AND type = 'human'
  ) THEN
    INSERT INTO portfolios (
      type,
      slug,
      user_id,
      metadata
    ) VALUES (
      'human'::portfolio_type,
      'user-' || NEW.id::text,
      NEW.id,
      jsonb_build_object(
        'basic', jsonb_build_object(
          'name', default_name,
          'description', '',
          'avatar', COALESCE((user_meta->>'avatar_url')::text, '')
        ),
        'pinned', '[]'::jsonb,
        'settings', '{}'::jsonb,
        'email', user_email,
        'username', default_username,
        'full_name', default_name,
        'avatar_url', COALESCE((user_meta->>'avatar_url')::text, '')
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the update
COMMENT ON FUNCTION create_human_portfolio_for_new_user() IS 
  'Automatically creates a human portfolio for each new user on signup using the new metadata structure';



