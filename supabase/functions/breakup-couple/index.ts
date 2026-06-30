// Supabase Edge Function: breakup-couple
// Permanently ends the authenticated user's current couple after deleting all
// Cloudinary assets under pinly/{coupleId}/. DB reset is blocked if media
// cleanup fails.
//
// Deploy: supabase functions deploy breakup-couple
// Env vars needed: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CloudinaryResourceType = "image" | "video";

interface CloudinaryListResponse {
  resources?: Array<{ public_id?: string }>;
  next_cursor?: string;
}

interface CloudinaryDestroyResponse {
  result?: string;
}

interface CloudinaryCleanupSummary {
  resourceType: CloudinaryResourceType;
  found: number;
  deleted: number;
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

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

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function cloudinaryAuthHeader(apiKey: string, apiSecret: string) {
  return `Basic ${btoa(`${apiKey}:${apiSecret}`)}`;
}

async function sha1Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function listCloudinaryResourcesByPrefix({
  cloudName,
  apiKey,
  apiSecret,
  prefix,
  resourceType,
}: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  prefix: string;
  resourceType: CloudinaryResourceType;
}) {
  const publicIds: string[] = [];
  let nextCursor: string | undefined;

  do {
    const url = new URL(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/upload`,
    );
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("max_results", "500");
    if (nextCursor) url.searchParams.set("next_cursor", nextCursor);

    const res = await fetch(url, {
      headers: {
        Authorization: cloudinaryAuthHeader(apiKey, apiSecret),
      },
    });
    const json = (await res.json().catch(() => null)) as
      | CloudinaryListResponse
      | null;

    if (!res.ok) {
      throw new Error(
        `Cloudinary list failed for ${resourceType}/${prefix}: ${JSON.stringify(json)}`,
      );
    }

    for (const resource of json?.resources ?? []) {
      if (resource.public_id?.startsWith(prefix)) {
        publicIds.push(resource.public_id);
      }
    }
    nextCursor = json?.next_cursor;
  } while (nextCursor);

  return publicIds;
}

async function destroyCloudinaryAsset({
  cloudName,
  apiKey,
  apiSecret,
  publicId,
  resourceType,
}: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  publicId: string;
  resourceType: CloudinaryResourceType;
}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await sha1Hex(
    `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`,
  );

  const body = new URLSearchParams();
  body.append("public_id", publicId);
  body.append("timestamp", timestamp);
  body.append("api_key", apiKey);
  body.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`,
    { method: "POST", body },
  );
  const json = (await res.json().catch(() => null)) as
    | CloudinaryDestroyResponse
    | null;
  if (!res.ok) {
    throw new Error(
      `Cloudinary delete failed for ${publicId}: ${JSON.stringify(json)}`,
    );
  }
  if (json?.result !== "ok" && json?.result !== "deleted") {
    throw new Error(
      `Cloudinary delete missed ${publicId}: ${JSON.stringify(json)}`,
    );
  }
  return json;
}

async function assertSpaceDeleteAllowed(
  serviceSupabase: ReturnType<typeof createClient>,
  coupleId: string,
  userId: string,
) {
  const { data: space, error: spaceError } = await serviceSupabase
    .from("spaces")
    .select("id,owner_id")
    .or(`id.eq.${coupleId},legacy_couple_id.eq.${coupleId}`)
    .limit(1)
    .maybeSingle();

  if (spaceError) throw spaceError;
  if (!space) return;

  if (space.owner_id !== userId) {
    throw Object.assign(new Error("Only space owners can delete spaces"), {
      status: 403,
    });
  }

  const { data: ownerMember, error: memberError } = await serviceSupabase
    .from("space_members")
    .select("user_id")
    .eq("space_id", space.id)
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();

  if (memberError) throw memberError;
  if (!ownerMember) {
    throw Object.assign(new Error("Only active space owners can delete spaces"), {
      status: 403,
    });
  }
}

async function deleteCloudinaryResourcesByPrefix({
  cloudName,
  apiKey,
  apiSecret,
  prefix,
  resourceType,
}: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  prefix: string;
  resourceType: CloudinaryResourceType;
}): Promise<CloudinaryCleanupSummary> {
  const publicIds = await listCloudinaryResourcesByPrefix({
    cloudName,
    apiKey,
    apiSecret,
    prefix,
    resourceType,
  });

  const batchSize = 8;
  let deleted = 0;
  for (let index = 0; index < publicIds.length; index += batchSize) {
    const batch = publicIds.slice(index, index + batchSize);
    const settled = await Promise.allSettled(
      batch.map((publicId) =>
        destroyCloudinaryAsset({
          cloudName,
          apiKey,
          apiSecret,
          publicId,
          resourceType,
        }),
      ),
    );
    const errors = settled
      .map((result, batchIndex) =>
        result.status === "rejected"
          ? {
              publicId: batch[batchIndex],
              error: result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
            }
          : null,
      )
      .filter(Boolean);
    if (errors.length > 0) {
      throw new Error(
        `Cloudinary ${resourceType} cleanup failed: ${JSON.stringify(errors)}`,
      );
    }
    deleted += batch.length;
  }

  return { resourceType, found: publicIds.length, deleted };
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
    if (!accessToken) {
      return jsonResponse({ error: "Missing bearer token" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const confirmText = String(body.confirmText ?? "")
      .trim()
      .toUpperCase();
    if (confirmText !== "KET THUC") {
      return jsonResponse({ error: "Invalid confirmation" }, 400);
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const anonKey = getRequiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } =
      await supabase.auth.getUser(accessToken);
    const userId = authData.user?.id;
    if (authError) console.warn("getUser failed:", authError.message);
    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: allowed, error: rateError } = await serviceSupabase.rpc(
      "check_edge_rate_limit",
      {
        limit_key: `breakup-couple:${userId}`,
        window_seconds: 3600,
        max_requests: 3,
      },
    );
    if (rateError) throw rateError;
    if (allowed === false) {
      return jsonResponse({ error: "Rate limit exceeded" }, 429);
    }

    const { data: profile, error: profileError } = await serviceSupabase
      .from("users")
      .select("couple_id")
      .eq("id", userId)
      .single();
    if (profileError) throw profileError;
    const coupleId = profile?.couple_id;
    if (!coupleId) {
      return jsonResponse({ error: "No active couple" }, 403);
    }

    const { data: couple, error: coupleError } = await serviceSupabase
      .from("couples")
      .select("id,user_a,user_b")
      .eq("id", coupleId)
      .single();
    if (coupleError) throw coupleError;
    if (couple?.user_a !== userId && couple?.user_b !== userId) {
      return jsonResponse({ error: "Not a couple member" }, 403);
    }

    await assertSpaceDeleteAllowed(serviceSupabase, coupleId, userId);

    const cloudName = getRequiredEnv("CLOUDINARY_CLOUD_NAME");
    const apiKey = getRequiredEnv("CLOUDINARY_API_KEY");
    const apiSecret = getRequiredEnv("CLOUDINARY_API_SECRET");
    const prefix = `pinly/${coupleId}/`;
    const cleanup = [
      await deleteCloudinaryResourcesByPrefix({
        cloudName,
        apiKey,
        apiSecret,
        prefix,
        resourceType: "image",
      }),
      await deleteCloudinaryResourcesByPrefix({
        cloudName,
        apiKey,
        apiSecret,
        prefix,
        resourceType: "video",
      }),
    ];

    const { data: result, error: finalizeError } = await serviceSupabase.rpc(
      "finalize_couple_breakup",
      {
        p_couple_id: coupleId,
        p_initiator_user_id: userId,
      },
    );
    if (finalizeError) {
      console.error("finalize_couple_breakup failed after media cleanup", {
        coupleId,
        userId,
        error: finalizeError.message,
      });
      return jsonResponse(
        {
          error:
            "Could not finish resetting the couple. Please contact support.",
        },
        500,
      );
    }

    return jsonResponse({ ok: true, cleanup, result });
  } catch (err) {
    console.error("breakup-couple error:", err);
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: unknown })?.status;
    if (typeof status === "number") {
      return jsonResponse({ error: message }, status);
    }
    if (message.includes("Cloudinary")) {
      return jsonResponse(
        { error: "Could not delete all media. Please try again.", details: message },
        502,
      );
    }
    return jsonResponse({ error: message }, 500);
  }
});
