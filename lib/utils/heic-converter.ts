/**
 * Utility functions for handling HEIC/HEIF image conversion
 * Converts HEIC files to JPEG format for browser compatibility
 */

/**
 * Check if a file is a HEIC/HEIF image
 */
export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    type.includes('heic') ||
    type.includes('heif')
  )
}

/**
 * Convert HEIC file to JPEG using heic2any library
 * @param file - The HEIC file to convert
 * @returns A Promise that resolves to a JPEG File
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  // Dynamic import to avoid loading the library if not needed
  // heic2any can be a default export or named export depending on version
  const heic2anyModule = await import('heic2any')
  const heic2any = heic2anyModule.default || heic2anyModule
  
  if (typeof heic2any !== 'function') {
    throw new Error('heic2any library is not available. Please ensure it is installed.')
  }
  
  try {
    // Convert HEIC to JPEG
    // heic2any returns a Blob or an array of Blobs
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92, // High quality conversion
    })
    
    // Get the converted blob (heic2any may return an array or single blob)
    const jpegBlob = Array.isArray(result) ? result[0] : result
    
    if (!(jpegBlob instanceof Blob)) {
      throw new Error('Conversion failed: Invalid blob returned')
    }
    
    // Create a new File object with JPEG extension
    const jpegFile = new File(
      [jpegBlob],
      file.name.replace(/\.(heic|heif)$/i, '.jpg'),
      {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      }
    )
    
    return jpegFile
  } catch (error: any) {
    console.error('HEIC conversion error:', error)
    throw new Error(
      `Failed to convert HEIC image: ${error.message || 'Unknown error'}. Please convert the image to JPEG or PNG before uploading.`
    )
  }
}

/**
 * Convert a file to a browser-compatible format if needed
 * If the file is HEIC, converts it to JPEG
 * Otherwise returns the original file
 */
export async function ensureBrowserCompatibleImage(file: File): Promise<File> {
  if (isHeicFile(file)) {
    return await convertHeicToJpeg(file)
  }
  return file
}

