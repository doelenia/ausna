import { createClient } from '@/lib/supabase/server'
import { compressImageToBlob } from './compress'

const BUCKET_NAME = 'avatars'

/**
 * Generate avatar file path in storage
 */
export function getAvatarPath(portfolioId: string, filename: string): string {
  return `portfolios/${portfolioId}/${filename}`
}

/**
 * Upload avatar to storage (server-side)
 */
export async function uploadAvatar(
  portfolioId: string,
  file: File | Blob,
  filename?: string
): Promise<{ path: string; url: string }> {
  const supabase = await createClient()
  
  // Generate filename if not provided
  const finalFilename = filename || `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
  const filePath = getAvatarPath(portfolioId, finalFilename)
  
  // Compress image before upload
  const compressedBlob = await compressImageToBlob(file, {
    maxWidth: 400,
    maxHeight: 400,
    quality: 85,
    format: 'jpeg',
  })
  
  // Upload compressed file
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, compressedBlob, {
      cacheControl: '3600',
      upsert: true, // Replace if exists
    })

  if (error) {
    throw new Error(`Failed to upload avatar: ${error.message}`)
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath)

  return {
    path: filePath,
    url: urlData.publicUrl,
  }
}

/**
 * Delete avatar from storage (server-side)
 */
export async function deleteAvatar(avatarUrl: string): Promise<void> {
  const supabase = await createClient()
  
  // Extract path from URL
  // URL format: https://{project}.supabase.co/storage/v1/object/public/avatars/portfolios/{id}/{filename}
  const urlParts = avatarUrl.split('/avatars/')
  if (urlParts.length !== 2) {
    throw new Error('Invalid avatar URL format')
  }
  
  const filePath = urlParts[1]
  
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([filePath])

  if (error) {
    throw new Error(`Failed to delete avatar: ${error.message}`)
  }
}

/**
 * Get public URL for avatar path
 */
export function getAvatarUrl(filePath: string): string {
  // This is a helper that constructs the URL
  // In practice, use the storage client's getPublicUrl method
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${filePath}`
}

