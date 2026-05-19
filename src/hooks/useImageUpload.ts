import { useState } from 'react'
import { compressImage } from '../lib/imageCompress'
import { uploadToCloudinary, type CloudinaryUploadResult } from '../lib/cloudinary'

export function useImageUpload() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function uploadFiles(files: File[]): Promise<CloudinaryUploadResult[]> {
    setUploading(true)
    setProgress(0)
    try {
      const results: CloudinaryUploadResult[] = []
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressImage(files[i])
        const res = await uploadToCloudinary(compressed)
        results.push(res)
        setProgress(Math.round(((i + 1) / files.length) * 100))
      }
      return results
    } finally {
      setUploading(false)
    }
  }

  return { uploadFiles, uploading, progress }
}
