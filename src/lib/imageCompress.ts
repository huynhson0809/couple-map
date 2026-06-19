import imageCompression from 'browser-image-compression'

export async function compressImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<File> {
  const options = {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    fileType: 'image/jpeg',
    onProgress,
  }
  return imageCompression(file, options)
}
