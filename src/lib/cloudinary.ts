const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string

export interface CloudinaryUploadResult {
  url: string
  publicId: string
  width: number
  height: number
}

export async function uploadToCloudinary(file: File): Promise<CloudinaryUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', UPLOAD_PRESET)
  formData.append('folder', 'couple-map')

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cloudinary upload failed: ${text}`)
  }

  const data = await res.json()
  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
  }
}

export function getImageUrl(url: string, width = 800, quality: number | 'auto' = 'auto'): string {
  if (!url.includes('/upload/')) return url
  return url.replace('/upload/', `/upload/w_${width},q_${quality},f_auto/`)
}
