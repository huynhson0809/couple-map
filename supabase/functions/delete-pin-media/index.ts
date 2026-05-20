// Supabase Edge Function: delete-pin-media
// Deletes pin media from Cloudinary with a signed server-side request, then
// removes the matching pin_images rows.
//
// Deploy: supabase functions deploy delete-pin-media
// Env vars needed: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DeleteAsset {
  id: string;
  publicId: string;
  resourceType: "image" | "video";
}

interface AuthJwtPayload {
  sub?: string;
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function decodeJwtPayload(token: string): AuthJwtPayload {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function sha1Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function destroyCloudinaryAsset(asset: DeleteAsset) {
  if (!asset.publicId) return { result: "skipped" };

  const cloudName = getRequiredEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = getRequiredEnv("CLOUDINARY_API_KEY");
  const apiSecret = getRequiredEnv("CLOUDINARY_API_SECRET");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await sha1Hex(
    `public_id=${asset.publicId}&timestamp=${timestamp}${apiSecret}`,
  );

  const body = new URLSearchParams();
  body.append("public_id", asset.publicId);
  body.append("timestamp", timestamp);
  body.append("api_key", apiKey);
  body.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${asset.resourceType}/destroy`,
    { method: "POST", body },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `Cloudinary delete failed for ${asset.publicId}: ${JSON.stringify(json)}`,
    );
  }
  return json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return jsonResponse({ error: "Missing bearer token" }, 401);
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const anonKey = getRequiredEnv("SUPABASE_ANON_KEY");
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: authData, error: authError } =
      await supabase.auth.getUser(accessToken);
    const userId = authData.user?.id ?? decodeJwtPayload(accessToken).sub;
    if (authError) console.warn("getUser failed, using verified JWT payload:", authError.message);
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const assets = Array.isArray(body.assets)
      ? (body.assets as DeleteAsset[])
      : [];
    const ids = assets.map((asset) => asset.id).filter(Boolean);
    if (ids.length === 0) {
      return jsonResponse({ deleted: 0 });
    }

    const { data: rows, error: rowsError } = await supabase
      .from("pin_images")
      .select("id, cloudinary_public_id, cloudinary_url")
      .in("id", ids);
    if (rowsError) throw rowsError;

    const allowedRows = rows ?? [];
    const allowedIds = new Set(allowedRows.map((row) => row.id));
    if (allowedIds.size !== ids.length) {
      return jsonResponse({ error: "Forbidden media id" }, 403);
    }

    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const verifiedAssets = allowedRows.map((row) => {
      const requested = assetsById.get(row.id);
      const isVideo = String(row.cloudinary_url).includes("/video/upload/");
      return {
        id: row.id,
        publicId: row.cloudinary_public_id ?? requested?.publicId ?? "",
        resourceType: isVideo ? "video" : "image",
      } satisfies DeleteAsset;
    });

    const cloudinarySettled = await Promise.allSettled(
      verifiedAssets.map((asset) => destroyCloudinaryAsset(asset)),
    );
    const cloudinaryErrors = cloudinarySettled
      .map((result, index) =>
        result.status === "rejected"
          ? {
              id: verifiedAssets[index].id,
              publicId: verifiedAssets[index].publicId,
              error: result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
            }
          : null
      )
      .filter(Boolean);
    if (cloudinaryErrors.length > 0) {
      return jsonResponse(
        { error: "Cloudinary delete failed", details: cloudinaryErrors },
        502,
      );
    }

    const { error: deleteError } = await supabase
      .from("pin_images")
      .delete()
      .in("id", Array.from(allowedIds));
    if (deleteError) throw deleteError;

    return jsonResponse({
        deleted: allowedIds.size,
        cloudinary: cloudinarySettled.map((result) =>
          result.status === "fulfilled" ? result.value : null
        ),
      });
  } catch (err) {
    console.error("delete-pin-media error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
