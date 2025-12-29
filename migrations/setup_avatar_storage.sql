-- Migration: Setup Avatar Storage Bucket
-- Creates storage bucket for portfolio avatars with appropriate policies

-- Step 1: Create storage bucket (if it doesn't exist)
-- Note: This requires Supabase Storage API or manual creation in dashboard
-- The bucket should be created as 'avatars' with public access

-- Step 2: Create storage policy for public read access
-- Anyone can view avatars
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Step 3: Create storage policy for authenticated upload
-- Only authenticated users can upload
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
);

-- Step 4: Create storage policy for portfolio owners to update/delete
-- Users can only modify avatars in portfolios/{portfolio_id}/ path for portfolios they own
CREATE POLICY "Portfolio owners can update their avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND (
    -- Extract portfolio_id from path: portfolios/{portfolio_id}/...
    -- Using split_part to get the second segment (index 2, 1-indexed)
    EXISTS (
      SELECT 1 FROM portfolios
      WHERE portfolios.id::text = split_part((storage.objects.name)::text, '/', 2)
        AND portfolios.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Portfolio owners can delete their avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND (
    -- Extract portfolio_id from path: portfolios/{portfolio_id}/...
    -- Using split_part to get the second segment (index 2, 1-indexed)
    EXISTS (
      SELECT 1 FROM portfolios
      WHERE portfolios.id::text = split_part((storage.objects.name)::text, '/', 2)
        AND portfolios.user_id = auth.uid()
    )
  )
);

-- Note: The bucket creation and path-based policies may need adjustment
-- based on Supabase Storage API capabilities. The policies above assume
-- the path structure is: portfolios/{portfolio_id}/{filename}

