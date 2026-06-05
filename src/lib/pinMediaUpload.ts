import { MAX_VIDEO_BYTES, uploadToCloudinary, type CloudinaryUploadResult } from "./cloudinary";
import { compressImage } from "./imageCompress";

export async function uploadPinMediaFiles(
  files: File[],
  folder: string,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryUploadResult[]> {
  const validFiles = files.filter(
    (file) =>
      file.size > 0 &&
      (file.type.startsWith("image/") || file.type.startsWith("video/")),
  );
  if (validFiles.length === 0) return [];

  const prepared = await Promise.all(
    validFiles.map(async (file) => {
      if (file.type.startsWith("video/")) {
        if (file.size > MAX_VIDEO_BYTES) {
          throw new Error(`Video quá lớn (max ${MAX_VIDEO_BYTES / 1024 / 1024}MB)`);
        }
        return file;
      }
      return compressImage(file);
    }),
  );

  let completed = 0;
  return Promise.all(
    prepared.map(async (file) => {
      const result = await uploadToCloudinary(file, { folder });
      completed += 1;
      onProgress?.(Math.round((completed / prepared.length) * 100));
      return result;
    }),
  );
}

export function toPinImageRows(
  pinId: string,
  uploads: CloudinaryUploadResult[],
  startOrder = 0,
) {
  return uploads.map((img, index) => ({
    pin_id: pinId,
    cloudinary_url: img.url,
    cloudinary_public_id: img.publicId,
    width: img.width,
    height: img.height,
    sort_order: startOrder + index,
  }));
}
