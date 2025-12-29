-- Migration: Setup Note Images Storage Bucket
-- Creates storage bucket for note images with appropriate policies

-- Step 1: Create storage policy for public read access
-- Anyone can view note images
CREATE POLICY "Note images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'note-images');

-- Step 2: Create storage policy for authenticated upload
-- Only authenticated users can upload
CREATE POLICY "Authenticated users can upload note images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'note-images' 
  AND auth.role() = 'authenticated'
);

-- Step 3: Create storage policy for note owners to update/delete
-- Users can only modify images in notes/{note_id}/ path for notes they own
CREATE POLICY "Note owners can update their images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'note-images'
  AND (
    -- Extract note_id from path: notes/{note_id}/...
    -- Using split_part to get the second segment (index 2, 1-indexed)
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id::text = split_part((storage.objects.name)::text, '/', 2)
        AND notes.owner_account_id = auth.uid()
    )
  )
);

CREATE POLICY "Note owners can delete their images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'note-images'
  AND (
    -- Extract note_id from path: notes/{note_id}/...
    -- Using split_part to get the second segment (index 2, 1-indexed)
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id::text = split_part((storage.objects.name)::text, '/', 2)
        AND notes.owner_account_id = auth.uid()
    )
  )
);

-- Note: The bucket 'note-images' should be created manually in Supabase Storage dashboard
-- with public access enabled. The path structure is: notes/{note_id}/{filename}

