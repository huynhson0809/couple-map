// Supabase Edge Function: sign-cloudinary-upload
// Returns a short-lived Cloudinary upload signature for the authenticated user's couple folder.
//
// Deploy: supabase functions deploy sign-cloudinary-upload
// Env vars needed: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

function resolveAllowedFolder(requestedFolder: string, coupleId: string) {
  const root = `pinly/${coupleId}`;
  const normalized = sanitizeFolder(requestedFolder || root);
  const legacyBackground = `pinly/backgrounds/${coupleId}`;
  const folder = normalized === "pinly"
    ? root
    : normalized === legacyBackground
      ? `${root}/backgrounds`
      : normalized;
  const allowed = new Set([root, `${root}/backgrounds`, `${root}/markers`]);
  if (!allowed.has(folder)) return null;
  return folder;
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
      .select("couple_id")
      .eq("id", authData.user.id)
      .single();
    if (profileError) throw profileError;
    if (!profile?.couple_id) return jsonResponse({ error: "No couple" }, 403);

    const body = await req.json().catch(() => ({}));
    const folder = resolveAllowedFolder(String(body.folder || ""), profile.couple_id);
    if (!folder) return jsonResponse({ error: "Forbidden upload folder" }, 403);

    const cloudName = getRequiredEnv("CLOUDINARY_CLOUD_NAME");
    const apiKey = getRequiredEnv("CLOUDINARY_API_KEY");
    const apiSecret = getRequiredEnv("CLOUDINARY_API_SECRET");
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await sha1Hex(`folder=${folder}&timestamp=${timestamp}${apiSecret}`);

    return jsonResponse({
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder,
    });
  } catch (err) {
    console.error("sign-cloudinary-upload error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
