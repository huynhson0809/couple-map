import imageCompression from "browser-image-compression";
import { getDeviceBudget } from "./deviceBudget";

let compressionQueue: Promise<unknown> = Promise.resolve();
const compressedFiles = new WeakSet<File>();

export async function compressImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<File> {
  if (compressedFiles.has(file)) {
    onProgress?.(100);
    return file;
  }
  const budget = getDeviceBudget();
  const job = compressionQueue.then(async () => {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: budget.imageMaxDimension,
      useWebWorker: !budget.constrained,
      maxIteration: budget.constrained ? 4 : 10,
      initialQuality: 0.8,
      preserveExif: false,
      fileType: "image/jpeg",
      onProgress,
    });
    compressedFiles.add(compressed);
    return compressed;
  });
  compressionQueue = job.catch(() => {});
  return job;
}
