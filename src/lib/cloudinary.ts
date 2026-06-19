import { supabase } from "./supabase";

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string;

interface CloudinarySignature {
  cloudName?: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  resourceType: "image" | "video";
  allowedFormats: string;
  maxFileSize: number;
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
  mediaType: "image" | "video";
  duration?: number;
}

interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  width: number;
  height: number;
  duration?: number;
}

export async function uploadToCloudinary(
  file: File,
  options: { folder?: string; onProgress?: (percent: number) => void } = {},
): Promise<CloudinaryUploadResult> {
  const isVideo = file.type.startsWith("video/");
  const resourceType = isVideo ? "video" : "image";
  const signature = await createUploadSignature(options.folder ?? "pinly", {
    resourceType,
    fileSize: file.size,
    contentType: file.type,
  });
  const max_file_size = signature.maxFileSize;
  if (file.size > max_file_size) {
    throw new Error(`File too large. Max ${Math.round(max_file_size / 1024 / 1024)}MB`);
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", signature.apiKey);
  formData.append("timestamp", String(signature.timestamp));
  formData.append("signature", signature.signature);
  formData.append("folder", signature.folder);
  formData.append("allowed_formats", signature.allowedFormats);

  const data = await postCloudinaryFormData(
    `https://api.cloudinary.com/v1_1/${signature.cloudName ?? CLOUD_NAME}/${resourceType}/upload`,
    formData,
    options.onProgress,
  );

  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
    mediaType: isVideo ? "video" : "image",
    duration: isVideo ? data.duration : undefined,
  };
}

function postCloudinaryFormData(
  url: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const responseText =
        typeof xhr.response === "string" ? xhr.response : xhr.responseText;
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Cloudinary upload failed: ${responseText}`));
        return;
      }
      try {
        const parsed = JSON.parse(responseText) as unknown;
        if (!isCloudinaryUploadResponse(parsed)) {
          reject(new Error("Cloudinary upload failed: invalid response"));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error("Cloudinary upload failed: invalid response"));
      }
    };
    xhr.onerror = () => {
      reject(new Error("Cloudinary upload failed: network error"));
    };
    xhr.send(formData);
  });
}

function isCloudinaryUploadResponse(
  value: unknown,
): value is CloudinaryUploadResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.secure_url === "string" &&
    typeof data.public_id === "string" &&
    typeof data.width === "number" &&
    typeof data.height === "number" &&
    (data.duration === undefined || typeof data.duration === "number")
  );
}

async function createUploadSignature(
  folder: string,
  constraints: {
    resourceType: "image" | "video";
    fileSize: number;
    contentType: string;
  },
): Promise<CloudinarySignature> {
  const { data, error } = await supabase.functions.invoke("sign-cloudinary-upload", {
    body: {
      folder: sanitizeFolder(folder),
      resourceType: constraints.resourceType,
      fileSize: constraints.fileSize,
      contentType: constraints.contentType,
    },
  });
  if (error) throw new Error(`Cloudinary signature failed: ${error.message}`);
  if (
    !data?.apiKey ||
    !data?.timestamp ||
    !data?.signature ||
    !data?.folder ||
    !data?.resourceType ||
    !data?.allowedFormats ||
    !data?.maxFileSize
  ) {
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
