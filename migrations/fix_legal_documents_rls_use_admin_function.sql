-- Fix RLS on legal_documents and user_legal_agreements: avoid direct auth.users access.
-- The authenticated role cannot read auth.users; use is_current_user_admin() (SECURITY DEFINER) instead.

-- legal_documents: replace "Admins manage legal documents" policy
DROP POLICY IF EXISTS "Admins manage legal documents" ON legal_documents;

CREATE POLICY "Admins manage legal documents"
  ON legal_documents FOR ALL
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- user_legal_agreements: replace "Admins can view all legal agreements" policy
DROP POLICY IF EXISTS "Admins can view all legal agreements" ON user_legal_agreements;

CREATE POLICY "Admins can view all legal agreements"
  ON user_legal_agreements FOR SELECT
  USING (is_current_user_admin());
