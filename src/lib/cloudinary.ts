import { supabase } from "./supabase";

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string;

interface CloudinarySignature {
  cloudName?: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
  mediaType: "image" | "video";
  duration?: number;
}

export async function uploadToCloudinary(
  file: File,
  options: { folder?: string } = {},
): Promise<CloudinaryUploadResult> {
  const isVideo = file.type.startsWith("video/");
  const resourceType = isVideo ? "video" : "image";
  const signature = await createUploadSignature(options.folder ?? "pinly");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", signature.apiKey);
  formData.append("timestamp", String(signature.timestamp));
  formData.append("signature", signature.signature);
  formData.append("folder", signature.folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName ?? CLOUD_NAME}/${resourceType}/upload`,
    { method: "POST", body: formData },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary upload failed: ${text}`);
  }

  const data = await res.json();
  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
    mediaType: isVideo ? "video" : "image",
    duration: isVideo ? data.duration : undefined,
  };
}

async function createUploadSignature(folder: string): Promise<CloudinarySignature> {
  const { data, error } = await supabase.functions.invoke("sign-cloudinary-upload", {
    body: { folder: sanitizeFolder(folder) },
  });
  if (error) throw new Error(`Cloudinary signature failed: ${error.message}`);
  if (!data?.apiKey || !data?.timestamp || !data?.signature || !data?.folder) {
    throw new Error("Cloudinary signature failed: invalid response");
  }
  return data as CloudinarySignature;
}

function sanitizeFolder(folder: string): string {
  return folder
    .split("/")
    .map((part) => part.trim().replace(/[^a-zA-Z0-9_-]/g, "-"))
    .filter(Boolean)
    .join("/") || "pinly";
}

export function getImageUrl(
  url: string,
  width = 800,
  quality: number | "auto" = "auto",
): string {
  if (!url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/w_${width},q_${quality},f_auto/`);
}

export function getVideoUrl(url: string, width = 720, quality = 70): string {
  if (!url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/w_${width},q_${quality},f_mp4/`);
}

export function isVideoUrl(url: string): boolean {
  return url.includes("/video/upload/");
}

export function getVideoThumbnailUrl(
  url: string,
  width = 800,
  quality: number | "auto" = "auto",
): string {
  if (!isVideoUrl(url)) return getImageUrl(url, width, quality);
  const transformed = url.replace(
    "/upload/",
    `/upload/w_${width},q_${quality},f_jpg,so_0/`,
  );
  return transformed.replace(/\.[a-z0-9]+($|\?)/i, ".jpg$1");
}

const MAX_VIDEO_SIZE_MB = 50;
export const MAX_VIDEO_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;
