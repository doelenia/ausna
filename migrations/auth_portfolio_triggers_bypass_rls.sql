-- Auth → portfolios triggers must bypass RLS: policies require is_current_user_approved(),
-- which is false until a non-pseudo human portfolio exists (chicken-and-egg on signup).
-- Applied as follow-up if signup_pseudo_until_email_verified ran without these SET clauses.

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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET row_security = off;

CREATE OR REPLACE FUNCTION sync_portfolios_non_pseudo_on_email_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE portfolios
    SET is_pseudo = false
    WHERE user_id = NEW.id
      AND type = 'human';

    UPDATE portfolios
    SET is_pseudo = false
    WHERE user_id = NEW.id
      AND type IN ('portfolio', 'space');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET row_security = off;
