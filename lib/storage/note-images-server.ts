import { createClient } from '@/lib/supabase/server'
import { compressImageToBlob } from './compress'

const BUCKET_NAME = 'note-images'

/**
 * Generate note image file path in storage
 */
export function getNoteImagePath(noteId: string, filename: string): string {
  return `notes/${noteId}/${filename}`
}

/**
 * Upload note image to storage (server-side) with compression
 */
export async function uploadNoteImage(
  noteId: string,
  file: File | Blob,
  filename?: string
): Promise<{ path: string; url: string }> {
  const supabase = await createClient()
  
  let compressedBlob: Blob & { format?: 'jpeg' | 'png' | 'webp' }
  
  try {
    // Compress image before upload (preserves PNG format for transparency)
    compressedBlob = await compressImageToBlob(file, {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 85,
      // Don't force format - let it auto-detect to preserve PNG transparency
    })
    
    // Validate compressed blob
    if (!compressedBlob || compressedBlob.size === 0) {
      throw new Error('Image compression resulted in empty blob')
    }
  } catch (error: any) {
    console.error('Error compressing image:', error)
    throw new Error(`Failed to compress image: ${error?.message || 'Unknown compression error'}`)
  }
  
  // Generate filename with correct extension based on format
  const format = compressedBlob.format || 'jpg'
  const extension = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg'
  const finalFilename = filename || `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`
  const filePath = getNoteImagePath(noteId, finalFilename)
  
  // Upload compressed file
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, compressedBlob, {
      cacheControl: '3600',
      upsert: true, // Replace if exists
    })

  if (error) {
    throw new Error(`Failed to upload note image: ${error.message}`)
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath)

  if (!urlData || !urlData.publicUrl) {
    throw new Error('Failed to get public URL for uploaded image')
  }

  return {
    path: filePath,
    url: urlData.publicUrl,
  }
}

/**
 * Delete note image from storage (server-side)
 */
export async function deleteNoteImage(imageUrl: string): Promise<void> {
  const supabase = await createClient()
  
  // Extract path from URL
  // URL format: https://{project}.supabase.co/storage/v1/object/public/note-images/notes/{note_id}/{filename}
  const urlParts = imageUrl.split('/note-images/')
  if (urlParts.length !== 2) {
    throw new Error('Invalid note image URL format')
  }
  
  const filePath = urlParts[1]
  
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([filePath])

  if (error) {
    throw new Error(`Failed to delete note image: ${error.message}`)
  }
}

/**
 * Get public URL for note image path
 */
export function getNoteImageUrl(filePath: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${filePath}`
}

/**
 * Delete all images associated with a note (including direct uploads and URL assets)
 * This deletes all files in the folder: notes/{noteId}/
 */
export async function deleteAllNoteImages(noteId: string): Promise<void> {
  const supabase = await createClient()
  
  const pathsToDelete: string[] = []
  
  // List direct files in the note's folder (uploaded images)
  const folderPath = `notes/${noteId}/`
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET_NAME)
    .list(folderPath, {
      limit: 1000,
      offset: 0,
    })

  if (listError && listError.message !== 'not found') {
    console.error('Failed to list note images:', listError)
    // Don't throw, continue with other cleanup methods
  } else if (files) {
    files.forEach((file) => {
      // Only add actual files, not folders
      if (!file.name.endsWith('/') && file.id) {
        pathsToDelete.push(`${folderPath}${file.name}`)
      }
    })
  }

  // List files in url-assets subfolder (header images, favicons)
  const urlAssetsPath = `notes/${noteId}/url-assets/`
  const { data: urlAssetsFiles, error: urlAssetsError } = await supabase.storage
    .from(BUCKET_NAME)
    .list(urlAssetsPath, {
      limit: 1000,
      offset: 0,
    })

  if (urlAssetsError && urlAssetsError.message !== 'not found') {
    console.error('Failed to list URL assets:', urlAssetsError)
  } else if (urlAssetsFiles) {
    urlAssetsFiles.forEach((file) => {
      if (!file.name.endsWith('/') && file.id) {
        pathsToDelete.push(`${urlAssetsPath}${file.name}`)
      }
    })
  }

  // Delete all collected files
  if (pathsToDelete.length > 0) {
    // Delete in batches if needed (Supabase might have limits)
    const batchSize = 100
    for (let i = 0; i < pathsToDelete.length; i += batchSize) {
      const batch = pathsToDelete.slice(i, i + batchSize)
      const { error: deleteError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(batch)

      if (deleteError) {
        console.error(`Failed to delete batch ${i / batchSize + 1}:`, deleteError)
        // Continue with other batches even if one fails
      } else {
        console.log(`Deleted batch ${i / batchSize + 1}: ${batch.length} files`)
      }
    }
    
    console.log(`Completed deletion of ${pathsToDelete.length} files for note ${noteId}`)
  } else {
    console.log(`No files found to delete for note ${noteId}`)
  }
}

