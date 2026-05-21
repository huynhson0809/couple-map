import { useState } from 'react'
import { compressImage } from '../lib/imageCompress'
import { uploadToCloudinary, MAX_VIDEO_BYTES, type CloudinaryUploadResult } from '../lib/cloudinary'

export function useImageUpload(folder = 'pinly') {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function uploadFiles(files: File[]): Promise<CloudinaryUploadResult[]> {
    setUploading(true)
    setProgress(0)
    try {
      const results: CloudinaryUploadResult[] = []
      const validFiles = files.filter(
        (file) =>
          file.size > 0 &&
          (file.type.startsWith('image/') || file.type.startsWith('video/')),
      )
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i]
        let toUpload: File

        if (file.type.startsWith('video/')) {
          if (file.size > MAX_VIDEO_BYTES) {
            throw new Error(`Video quá lớn (max ${MAX_VIDEO_BYTES / 1024 / 1024}MB)`)
          }
          toUpload = file
        } else {
          toUpload = await compressImage(file)
        }

        const res = await uploadToCloudinary(toUpload, { folder })
        results.push(res)
        setProgress(Math.round(((i + 1) / validFiles.length) * 100))
      }
      return results
    } finally {
      setUploading(false)
    }
  }

  return { uploadFiles, uploading, progress }
}
