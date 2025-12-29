-- Migration script to convert existing profiles to human portfolios
-- This assumes you have a 'profiles' table with the following structure:
--   id UUID (references auth.users)
--   username TEXT
--   full_name TEXT (optional)
--   avatar_url TEXT (optional)
--   email TEXT (optional)
--   created_at TIMESTAMPTZ
--   updated_at TIMESTAMPTZ

-- Step 1: Migrate existing profiles to human portfolios
-- For each profile, create a corresponding human portfolio
INSERT INTO portfolios (
  type,
  title,
  description,
  slug,
  user_id,
  created_at,
  updated_at,
  metadata
)
SELECT 
  'human'::portfolio_type,
  COALESCE(full_name, username, 'User') as title,
  NULL as description,
  -- Generate slug from username, fallback to user ID if username is null
  COALESCE(
    LOWER(REGEXP_REPLACE(username, '[^a-zA-Z0-9_-]', '-', 'g')),
    'user-' || id::text
  ) as slug,
  id as user_id,
  COALESCE(created_at, NOW()) as created_at,
  COALESCE(updated_at, NOW()) as updated_at,
  -- Store profile-specific data in metadata
  jsonb_build_object(
    'username', username,
    'full_name', full_name,
    'avatar_url', avatar_url,
    'email', email
  ) as metadata
FROM profiles
WHERE NOT EXISTS (
  -- Only migrate if user doesn't already have a human portfolio
  SELECT 1 
  FROM portfolios 
  WHERE portfolios.user_id = profiles.id 
    AND portfolios.type = 'human'
);

-- Step 2: Create human portfolios for users who don't have profiles
-- This handles users who signed up but never created a profile
INSERT INTO portfolios (
  type,
  title,
  description,
  slug,
  user_id,
  created_at,
  updated_at,
  metadata
)
SELECT 
  'human'::portfolio_type,
  COALESCE(
    (raw_user_meta_data->>'full_name')::text,
    (raw_user_meta_data->>'name')::text,
    SPLIT_PART(email, '@', 1),
    'User'
  ) as title,
  NULL as description,
  'user-' || id::text as slug,
  id as user_id,
  created_at,
  updated_at,
  jsonb_build_object(
    'email', email,
    'username', SPLIT_PART(email, '@', 1)
  ) as metadata
FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 
  FROM portfolios 
  WHERE portfolios.user_id = auth.users.id 
    AND portfolios.type = 'human'
);

-- Step 3: Create a function to automatically create human portfolio for new users
CREATE OR REPLACE FUNCTION create_human_portfolio_for_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  user_meta JSONB;
  default_username TEXT;
  default_title TEXT;
BEGIN
  user_email := NEW.email;
  user_meta := NEW.raw_user_meta_data;
  
  -- Generate default username from email
  default_username := SPLIT_PART(user_email, '@', 1);
  
  -- Generate default title from metadata or email
  default_title := COALESCE(
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
      title,
      slug,
      user_id,
      metadata
    ) VALUES (
      'human'::portfolio_type,
      default_title,
      'user-' || NEW.id::text,
      NEW.id,
      jsonb_build_object(
        'email', user_email,
        'username', default_username
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create trigger to auto-create human portfolio on user signup
DROP TRIGGER IF EXISTS trigger_create_human_portfolio ON auth.users;
CREATE TRIGGER trigger_create_human_portfolio
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_human_portfolio_for_new_user();

-- Step 5: Add comment explaining the migration
COMMENT ON FUNCTION create_human_portfolio_for_new_user() IS 
  'Automatically creates a human portfolio for each new user on signup';

