-- Remove deprecated portfolio metadata.pinned (replaced by note post kinds such as resource).

UPDATE portfolios
SET metadata = metadata - 'pinned'
WHERE metadata ? 'pinned';

-- New human portfolios: omit pinned from default metadata (matches app inserts).
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
        'settings', '{}'::jsonb,
        'email', user_email,
        'username', default_username,
        'full_name', default_name,
        'avatar_url', COALESCE((user_meta->>'avatar_url')::text, '')
      ),
      (NEW.email_confirmed_at IS NULL)
    );
  END IF;

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

COMMENT ON COLUMN portfolios.metadata IS
  'Portfolio metadata JSON: basic (name, description, avatar), settings, and type-specific fields (members, managers, project types, etc.).';
