import { MAX_VIDEO_BYTES, uploadToCloudinary, type CloudinaryUploadResult } from "./cloudinary";
import { compressImage } from "./imageCompress";

function waitForNextFrame() {
  if (typeof window === "undefined" || !window.requestAnimationFrame) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

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

  const uploads: CloudinaryUploadResult[] = [];
  let lastReported = -1;
  let lastReportAt = 0;

  const report = (value: number, force = false) => {
    const rounded = Math.max(
      lastReported,
      Math.min(100, Math.round(value)),
    );
    const now = Date.now();
    if (!force && rounded === lastReported) return;
    if (!force && now - lastReportAt < 120 && rounded < 100) return;
    lastReported = rounded;
    lastReportAt = now;
    onProgress?.(rounded);
  };

  report(0, true);

  for (let index = 0; index < validFiles.length; index += 1) {
    const originalFile = validFiles[index];
    const fileStart = (index / validFiles.length) * 100;
    const fileShare = 100 / validFiles.length;
    const reportFileProgress = (percent: number, force = false) => {
      report(fileStart + fileShare * (percent / 100), force);
    };

    if (originalFile.type.startsWith("video/")) {
      if (originalFile.size > MAX_VIDEO_BYTES) {
        throw new Error(`Video quá lớn (max ${MAX_VIDEO_BYTES / 1024 / 1024}MB)`);
      }
    }

    await waitForNextFrame();
    const preparedFile = originalFile.type.startsWith("image/")
      ? await compressImage(originalFile, (pct) =>
          reportFileProgress(pct * 0.3),
        )
      : originalFile;

    reportFileProgress(30);
    await waitForNextFrame();
    const result = await uploadToCloudinary(preparedFile, {
      folder,
      onProgress: (pct) => reportFileProgress(30 + pct * 0.7),
    });
    uploads.push(result);
    reportFileProgress(100, true);
  }

  report(100, true);
  return uploads;
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
