-- Auto-subscribe every new user to the Ausna space (as a subscription, not membership).
-- Users can freely unsubscribe (delete their own subscription row via existing RLS policy).

-- NOTE: This hooks into the existing auth.users INSERT trigger function used to create
-- the human portfolio record. We extend it to also create a default subscription.

CREATE OR REPLACE FUNCTION create_human_portfolio_for_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  user_meta JSONB;
  default_username TEXT;
  default_name TEXT;
  ausna_space_id UUID := 'a1b40e33-1d1a-4150-bedf-ef472de1e64b'::uuid;
  ausna_space_owner_id UUID;
BEGIN
  user_email := NEW.email;
  user_meta := NEW.raw_user_meta_data;

  default_username := SPLIT_PART(user_email, '@', 1);

  default_name := COALESCE(
    (user_meta->>'full_name')::text,
    (user_meta->>'name')::text,
    default_username,
    'User'
  );

  -- Create human portfolio for new user (only if it doesn't exist).
  IF NOT EXISTS (
    SELECT 1 FROM portfolios
    WHERE user_id = NEW.id AND type = 'human'
  ) THEN
    INSERT INTO portfolios (
      type,
      slug,
      user_id,
      metadata,
      is_pseudo
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
      ),
      (NEW.email_confirmed_at IS NULL)
    );
  END IF;

  -- Default subscription: Ausna space.
  -- - Only if the space exists.
  -- - Skip if the user is the space owner (API disallows self-subscribe).
  -- - Only if not already subscribed.
  SELECT p.user_id INTO ausna_space_owner_id
  FROM portfolios p
  WHERE p.id = ausna_space_id
  LIMIT 1;

  IF ausna_space_owner_id IS NOT NULL AND ausna_space_owner_id <> NEW.id THEN
    INSERT INTO subscriptions (user_id, portfolio_id)
    SELECT NEW.id, ausna_space_id
    WHERE NOT EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = NEW.id AND s.portfolio_id = ausna_space_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET row_security = off;

COMMENT ON FUNCTION create_human_portfolio_for_new_user() IS
  'Creates human portfolio on signup; pseudo until email_confirmed_at is set, and auto-subscribes the user to the Ausna space.';

-- Ensure the trigger exists (safe to re-run).
DROP TRIGGER IF EXISTS trigger_create_human_portfolio ON auth.users;
CREATE TRIGGER trigger_create_human_portfolio
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_human_portfolio_for_new_user();

