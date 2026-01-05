-- Migration: Image Compression Setup
-- This migration documents the image compression setup
-- Actual compression is handled in application code using sharp library

-- Note: Image compression for avatars and note images is handled in:
-- - lib/storage/compress.ts (compression utility)
-- - lib/storage/avatars-server.ts (avatar upload with compression)
-- - lib/storage/note-images-server.ts (note image upload with compression)

-- No database changes needed for compression setup
-- Compression happens at upload time in the application layer


