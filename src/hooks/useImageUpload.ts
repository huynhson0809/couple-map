import { useCallback, useRef, useState } from 'react'
import { compressImage } from '../lib/imageCompress'
import { uploadToCloudinary, MAX_VIDEO_BYTES, type CloudinaryUploadResult } from '../lib/cloudinary'

export function useImageUpload(folder = 'pinly') {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const completedRef = useRef(0)

  const uploadFiles = useCallback(async (
    files: File[],
    onProgress?: (percent: number) => void,
  ): Promise<CloudinaryUploadResult[]> => {
    setUploading(true)
    setProgress(0)
    completedRef.current = 0
    onProgress?.(0)
    try {
      const validFiles = files.filter(
        (file) =>
          file.size > 0 &&
          (file.type.startsWith('image/') || file.type.startsWith('video/')),
      )
      if (validFiles.length === 0) return []

      // Prepare all files (compress images) in parallel
      const prepared = await Promise.all(
        validFiles.map(async (file) => {
          if (file.type.startsWith('video/')) {
            if (file.size > MAX_VIDEO_BYTES) {
              throw new Error(`Video quá lớn (max ${MAX_VIDEO_BYTES / 1024 / 1024}MB)`)
            }
            return file
          }
          return compressImage(file)
        }),
      )

      // Upload all files in parallel
      const results = await Promise.all(
        prepared.map(async (file) => {
          const res = await uploadToCloudinary(file, { folder })
          completedRef.current += 1
          const pct = Math.round((completedRef.current / prepared.length) * 100)
          setProgress(pct)
          onProgress?.(pct)
          return res
        }),
      )

      return results
    } finally {
      setUploading(false)
    }
  }, [folder])

  return { uploadFiles, uploading, progress }
}
