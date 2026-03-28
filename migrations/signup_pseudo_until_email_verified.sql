-- New self-service signups: human portfolio is pseudo until email is verified
-- (aligned with add-contact / invite: pseudo until onboarding confirms email).
--
-- 1) On INSERT: is_pseudo = true when email_confirmed_at is null; false when already confirmed.
-- 2) On UPDATE: when email_confirmed_at becomes non-null, flip human + owned projects to non-pseudo.

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

COMMENT ON FUNCTION create_human_portfolio_for_new_user() IS
  'Creates human portfolio on signup; pseudo until email_confirmed_at is set (matches invite/contact flow).';

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

COMMENT ON FUNCTION sync_portfolios_non_pseudo_on_email_confirm() IS
  'When auth email is verified, mark human and owned project portfolios as non-pseudo.';

DROP TRIGGER IF EXISTS trigger_sync_portfolios_on_email_confirm ON auth.users;
CREATE TRIGGER trigger_sync_portfolios_on_email_confirm
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at
        AND NEW.email_confirmed_at IS NOT NULL
        AND OLD.email_confirmed_at IS NULL)
  EXECUTE FUNCTION sync_portfolios_non_pseudo_on_email_confirm();

-- Backfill: unverified auth users should not appear as verified in search
UPDATE portfolios p
SET is_pseudo = true
FROM auth.users u
WHERE p.user_id = u.id
  AND p.type = 'human'
  AND u.email_confirmed_at IS NULL
  AND COALESCE(p.is_pseudo, false) = false;
