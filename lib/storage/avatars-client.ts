/**
 * Client-side avatar upload helpers
 * This file only contains client-side code and can be safely imported in client components
 */

import { SupabaseClient } from '@supabase/supabase-js'

const BUCKET_NAME = 'avatars'

/**
 * Generate avatar file path in storage
 */
export function getAvatarPath(portfolioId: string, filename: string): string {
  return `portfolios/${portfolioId}/${filename}`
}

/**
 * Client-side avatar upload helper
 */
export function createAvatarUploadHelpers(supabase: SupabaseClient) {
  return {
    async uploadAvatar(
      portfolioId: string,
      file: File | Blob,
      filename?: string
    ): Promise<{ path: string; url: string }> {
      const finalFilename = filename || `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const filePath = getAvatarPath(portfolioId, finalFilename)
      
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (error) {
        throw new Error(`Failed to upload avatar: ${error.message}`)
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath)

      return {
        path: filePath,
        url: urlData.publicUrl,
      }
    },

    async deleteAvatar(avatarUrl: string): Promise<void> {
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
    },
  }
}





