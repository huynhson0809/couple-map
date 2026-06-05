import { useCallback, useRef, useState } from 'react'
import type { CloudinaryUploadResult } from '../lib/cloudinary'
import { uploadPinMediaFiles } from '../lib/pinMediaUpload'

export function useImageUpload(folder = 'pinly') {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const activeRef = useRef(false)

  const uploadFiles = useCallback(async (
    files: File[],
    onProgress?: (percent: number) => void,
  ): Promise<CloudinaryUploadResult[]> => {
    setUploading(true)
    setProgress(0)
    activeRef.current = true
    onProgress?.(0)
    try {
      return await uploadPinMediaFiles(files, folder, (pct) => {
        if (activeRef.current) {
          setProgress(pct)
        }
        onProgress?.(pct)
      })
    } finally {
      activeRef.current = false
      setUploading(false)
    }
  }, [folder])

  return { uploadFiles, uploading, progress }
}
