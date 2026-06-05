// Supabase Edge Function: activate-code
// Validates an activation code and activates a subscription for the couple
//
// Deploy: supabase functions deploy create-checkout
// (keeping the same function name to avoid client changes)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
      { "Allow": "POST, OPTIONS" },
    );
  }

  try {
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing auth header" }, 401);

    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      console.error("Auth error:", authErr?.message);
      return jsonResponse(
        { error: "Auth failed: " + (authErr?.message ?? "no user") },
        401,
      );
    }

    // Get user's couple
    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .select("couple_id")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.couple_id) {
      console.error("Profile error:", profileErr?.message);
      return jsonResponse({ error: "No couple found" }, 400);
    }

    // Use service role for activation_codes table access and abuse controls.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: allowed, error: rateError } = await supabaseAdmin.rpc(
      "check_edge_rate_limit",
      {
        limit_key: `activate-code:${user.id}`,
        window_seconds: 3600,
        max_requests: 20,
      },
    );
    if (rateError) return jsonResponse({ error: "Rate limit unavailable" }, 500);
    if (allowed === false) return jsonResponse({ error: "Too many attempts" }, 429);

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code : "";

    if (!code || code.trim().length === 0) {
      return jsonResponse({ error: "Code is required" }, 400);
    }

    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length > 64) {
      return jsonResponse({ error: "Code is too long" }, 400);
    }

    // Find the code
    const { data: codeRecord, error: codeErr } = await supabaseAdmin
      .from("activation_codes")
      .select("*")
      .eq("code", normalizedCode)
      .single();

    if (codeErr || !codeRecord) {
      return jsonResponse({ error: "Mã không hợp lệ" }, 404);
    }

    // Check if already used
    if (codeRecord.used_by_couple_id) {
      return jsonResponse({ error: "Mã đã được sử dụng" }, 400);
    }

    // Check if code itself has expired
    if (codeRecord.expires_at && new Date(codeRecord.expires_at) < new Date()) {
      return jsonResponse({ error: "Mã đã hết hạn" }, 400);
    }

    const plan = codeRecord.plan as "plus" | "pro";
    const durationDays = codeRecord.duration_days as number;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + durationDays * 86_400_000);

    // Mark code as used
    await supabaseAdmin
      .from("activation_codes")
      .update({
        used_by_couple_id: profile.couple_id,
        used_at: now.toISOString(),
      })
      .eq("id", codeRecord.id);

    // Expire any existing active subscription
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "expired", updated_at: now.toISOString() })
      .eq("couple_id", profile.couple_id)
      .eq("status", "active");

    // Create new subscription
    await supabaseAdmin.from("subscriptions").insert({
      couple_id: profile.couple_id,
      plan,
      billing_cycle: durationDays >= 365 ? "annual" : "monthly",
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      activated_code: normalizedCode,
    });

    // Update couple plan
    await supabaseAdmin
      .from("couples")
      .update({ plan })
      .eq("id", profile.couple_id);

    return jsonResponse({
      success: true,
      plan,
      expires_at: periodEnd.toISOString(),
      message: `Đã kích hoạt gói ${plan === "pro" ? "Pro" : "Plus"} đến ${periodEnd.toLocaleDateString("vi-VN")}`,
    });
  } catch (err) {
    console.error("activate-code error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
