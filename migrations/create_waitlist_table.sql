-- Create waitlist table for managing user signup approvals
CREATE TABLE waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX idx_waitlist_email ON waitlist(email);
CREATE INDEX idx_waitlist_status ON waitlist(status);
CREATE INDEX idx_waitlist_created_at ON waitlist(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Policy: Only admins can view all waitlist entries
-- Regular users cannot view waitlist
CREATE POLICY "Admins can view waitlist"
  ON waitlist FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'is_admin')::boolean = true
    )
  );

-- Policy: Anyone can insert themselves into waitlist (for signup)
CREATE POLICY "Anyone can add to waitlist"
  ON waitlist FOR INSERT
  WITH CHECK (true);

-- Policy: Only admins can update waitlist entries
CREATE POLICY "Admins can update waitlist"
  ON waitlist FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'is_admin')::boolean = true
    )
  );

-- Add comment to table
COMMENT ON TABLE waitlist IS 'Waitlist for user signup approvals. Users must be approved before they can create an account.';
COMMENT ON COLUMN waitlist.status IS 'Status: pending (awaiting approval), approved (can sign up), rejected (denied)';
COMMENT ON COLUMN waitlist.approved_by IS 'Admin user ID who approved this waitlist entry';


