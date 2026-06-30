// Supabase Edge Function: sign-cloudinary-upload
// Returns a short-lived Cloudinary upload signature for an authenticated space folder.
//
// Deploy: supabase functions deploy sign-cloudinary-upload
// Env vars needed: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type UploadResourceType = "image" | "video";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"];
const VIDEO_FORMATS = ["mp4", "mov", "webm", "m4v"];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function sanitizeFolder(folder: string): string {
  return folder
    .split("/")
    .map((part) => part.trim().replace(/[^a-zA-Z0-9_-]/g, "-"))
    .filter(Boolean)
    .join("/") || "pinly";
}

async function sha1Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string,
) {
  const payload = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return sha1Hex(`${payload}${apiSecret}`);
}

function resolveAllowedFolder(
  requestedFolder: string,
  fallbackSpaceId: string | null,
) {
  const fallbackRoot = fallbackSpaceId ? `pinly/${fallbackSpaceId}` : "pinly";
  const normalized = sanitizeFolder(requestedFolder || fallbackRoot);
  const parts = normalized.split("/");
  const legacyBackgroundSpaceId =
    parts.length === 3 && parts[0] === "pinly" && parts[1] === "backgrounds"
      ? parts[2]
      : null;
  const requestedSpaceId =
    normalized === "pinly" ? fallbackSpaceId : legacyBackgroundSpaceId ?? parts[1];

  if (!requestedSpaceId || !UUID_PATTERN.test(requestedSpaceId)) return null;

  const root = `pinly/${requestedSpaceId}`;
  const legacyBackground = `pinly/backgrounds/${requestedSpaceId}`;
  const folder =
    normalized === "pinly"
      ? root
      : normalized === legacyBackground
        ? `${root}/backgrounds`
        : normalized;
  const allowed = new Set([root, `${root}/backgrounds`, `${root}/markers`]);
  if (!allowed.has(folder)) return null;
  return { folder, spaceId: requestedSpaceId };
}

function normalizeResourceType(value: unknown): UploadResourceType | null {
  if (value === "image" || value === "video") return value;
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) return jsonResponse({ error: "Missing bearer token" }, 401);

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const anonKey = getRequiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user?.id) return jsonResponse({ error: "Unauthorized" }, 401);

    const { data: allowed, error: rateError } = await serviceSupabase.rpc(
      "check_edge_rate_limit",
      {
        limit_key: `cloudinary-sign:${authData.user.id}`,
        window_seconds: 3600,
        max_requests: 80,
      },
    );
    if (rateError) throw rateError;
    if (allowed === false) return jsonResponse({ error: "Rate limit exceeded" }, 429);

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("couple_id, active_space_id")
      .eq("id", authData.user.id)
      .single();
    if (profileError) throw profileError;

    const body = await req.json().catch(() => ({}));
    const fallbackSpaceId = profile?.active_space_id ?? profile?.couple_id ?? null;
    const resolvedUpload = resolveAllowedFolder(
      String(body.folder || ""),
      fallbackSpaceId,
    );
    if (!resolvedUpload) {
      return jsonResponse({ error: "Forbidden upload folder" }, 403);
    }

    const { data: membership, error: membershipError } = await serviceSupabase
      .from("space_members")
      .select("space_id")
      .eq("space_id", resolvedUpload.spaceId)
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .limit(1);

    if (membershipError) {
      console.error("Space membership lookup error:", membershipError.message);
      return jsonResponse({ error: "Unable to verify space access" }, 500);
    }
    if (!membership?.length) {
      return jsonResponse({ error: "Forbidden upload folder" }, 403);
    }

    const resourceType = normalizeResourceType(body.resourceType);
    if (!resourceType) return jsonResponse({ error: "Invalid resource type" }, 400);

    const fileSize = Number(body.fileSize);
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return jsonResponse({ error: "Invalid file size" }, 400);
    }

    const contentType = String(body.contentType || "").toLowerCase();
    if (resourceType === "image" && !contentType.startsWith("image/")) {
      return jsonResponse({ error: "Invalid image content type" }, 400);
    }
    if (resourceType === "video" && !contentType.startsWith("video/")) {
      return jsonResponse({ error: "Invalid video content type" }, 400);
    }

    const maxFileSize = resourceType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (fileSize > maxFileSize) {
      return jsonResponse({ error: "File too large", maxFileSize }, 413);
    }

    const { data: effectivePlan, error: planError } = await serviceSupabase.rpc(
      "get_space_effective_plan",
      { p_space_id: resolvedUpload.spaceId },
    );
    if (planError) {
      console.error("Plan lookup error:", planError.message);
      return jsonResponse({ error: "Unable to verify plan" }, 500);
    }

    const canUploadVideo = effectivePlan === "pro";
    if (resourceType === "video" && !canUploadVideo) {
      return jsonResponse({ error: "Video upload requires Pro" }, 403);
    }

    const cloudName = getRequiredEnv("CLOUDINARY_CLOUD_NAME");
    const apiKey = getRequiredEnv("CLOUDINARY_API_KEY");
    const apiSecret = getRequiredEnv("CLOUDINARY_API_SECRET");
    const timestamp = Math.floor(Date.now() / 1000);
    const allowedFormats =
      resourceType === "video" ? VIDEO_FORMATS.join(",") : IMAGE_FORMATS.join(",");
    const signatureParams = {
      allowed_formats: allowedFormats,
      folder: resolvedUpload.folder,
      timestamp,
    };
    const signature = await signCloudinaryParams(signatureParams, apiSecret);

    return jsonResponse({
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder: resolvedUpload.folder,
      resourceType,
      allowedFormats,
      maxFileSize,
    });
  } catch (err) {
    console.error("sign-cloudinary-upload error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
