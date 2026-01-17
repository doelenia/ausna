-- Migration: Add project type and member roles to portfolios
-- This migration adds:
-- 1. project_type_general and project_type_specific to portfolio metadata
-- 2. memberRoles object map to portfolio metadata
-- 3. role column to portfolio_invitations table

-- Step 1: Add role column to portfolio_invitations table
ALTER TABLE portfolio_invitations
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Member';

-- Update comment
COMMENT ON COLUMN portfolio_invitations.role IS 'The role assigned to the invitee when they join (defaults to "Member")';

-- Step 2: Add project type fields to existing project/community portfolios
-- Set default values for existing portfolios
UPDATE portfolios
SET metadata = jsonb_set(
  jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{project_type_general}',
    '"Product & Building"'
  ),
  '{project_type_specific}',
  '"Project"'
)
WHERE type IN ('projects', 'community')
  AND (metadata->>'project_type_general' IS NULL OR metadata->>'project_type_specific' IS NULL);

-- Step 3: Initialize memberRoles object for existing portfolios
-- Set creator's role to "Creator" for all existing project/community portfolios
UPDATE portfolios
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{memberRoles}',
  jsonb_build_object(user_id::text, 'Creator')
)
WHERE type IN ('projects', 'community')
  AND (metadata->>'memberRoles' IS NULL OR metadata->'memberRoles' = '{}'::jsonb);

-- Step 4: Update comment explaining the new structure
COMMENT ON COLUMN portfolios.metadata IS 'Portfolio metadata with structure: {basic: {name, description, avatar}, pinned: [{type: "portfolio"|"note", id: string}], settings: {}, members?: [], managers?: [], project_type_general?: string, project_type_specific?: string, memberRoles?: {[userId]: role}}. For projects/communities: members (user IDs), managers (user IDs), project_type_general (general category), project_type_specific (specific type, max 2 words), memberRoles (object mapping userId to role, max 2 words). Creator is portfolio.user_id.';


