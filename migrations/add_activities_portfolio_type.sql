-- Migration: add 'activities' to portfolio_type enum
-- This assumes portfolio_type was originally created in create_portfolios_table.sql
-- and currently has values ('human', 'projects', 'community').

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'portfolio_type'
      AND e.enumlabel = 'activities'
  ) THEN
    ALTER TYPE portfolio_type ADD VALUE 'activities';
  END IF;
END $$;

