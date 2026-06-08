// Supabase Edge Function: send-nudge
// Sends a push notification nudge from one partner to the other.
// Anti-spam: 1 nudge per sender per calendar day (VN time).
//
// Deploy: supabase functions deploy send-nudge --no-verify-jwt
// Env vars needed: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(req);
  if (!token) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Service client for all operations including auth verification
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify user identity via service role (most reliable in Edge Functions)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Get the user's couple
  const { data: couple } = await supabase
    .from("couples")
    .select("id, user_a, user_b")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .maybeSingle();

  if (!couple) {
    return jsonResponse({ error: "No couple found" }, 404);
  }

  const partnerId = couple.user_a === user.id ? couple.user_b : couple.user_a;
  if (!partnerId) {
    return jsonResponse({ error: "Partner not found" }, 404);
  }

  // Anti-spam: check if already nudged today (VN time)
  const vnToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { data: existing, error: nudgeCheckError } = await supabase
    .from("streak_nudge_logs")
    .select("id")
    .eq("couple_id", couple.id)
    .eq("sender_id", user.id)
    .eq("nudge_date", vnToday)
    .maybeSingle();

  // If the table doesn't exist yet, skip the duplicate check
  if (nudgeCheckError && !nudgeCheckError.message.includes("does not exist")) {
    console.error("Nudge check error:", nudgeCheckError.message);
  }

  if (existing) {
    return jsonResponse({ error: "already_nudged_today", sent: false }, 429);
  }

  // Check partner's notification preferences
  const { data: pref } = await supabase
    .from("notification_preferences")
    .select("streak_reminders")
    .eq("user_id", partnerId)
    .maybeSingle();

  if (pref && pref.streak_reminders === false) {
    // Still log the nudge to prevent re-attempts, but don't send
    await supabase.from("streak_nudge_logs").insert({
      couple_id: couple.id,
      sender_id: user.id,
      nudge_date: vnToday,
    });
    return jsonResponse({ sent: false, reason: "partner_disabled_reminders" });
  }

  // Get sender's display name
  const { data: senderProfile } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const senderName = senderProfile?.display_name ?? "Người ấy";

  // Get partner's push subscriptions
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", partnerId);

  const rows = (subscriptions ?? []) as {
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];

  if (rows.length === 0) {
    // Log the nudge anyway (best effort)
    await supabase
      .from("streak_nudge_logs")
      .insert({
        couple_id: couple.id,
        sender_id: user.id,
        nudge_date: vnToday,
      })
      .then(() => {});
    return jsonResponse({
      sent: false,
      reason: "no_push_subscriptions",
      debug: { partnerId, subscriptionCount: 0 },
    });
  }

  // Build push payload
  const payload = JSON.stringify({
    title: `${senderName} nhắc nhẹ 💕`,
    body: "Hôm nay chưa nối chuỗi nè, lưu một khoảnh khắc nhé!",
    data: { type: "streak_nudge", url: "/" },
  });

  // Configure web push
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  // Send to all subscriptions
  const results = await Promise.allSettled(
    rows.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      ),
    ),
  );

  // Clean up expired subscriptions
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected" && result.reason?.statusCode === 410) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", rows[i].endpoint);
    }
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => ({
      status: r.reason?.statusCode,
      msg: r.reason?.body ?? r.reason?.message,
    }));

  if (failed.length > 0) {
    console.error("Nudge push failures:", JSON.stringify(failed));
  }

  // Log the nudge (best effort)
  await supabase.from("streak_nudge_logs").insert({
    couple_id: couple.id,
    sender_id: user.id,
    nudge_date: vnToday,
  });

  // Also insert an in-app notification for the partner
  await supabase.from("notifications").insert({
    user_id: partnerId,
    couple_id: couple.id,
    type: "streak_reminder",
    title: `${senderName} nhắc nhẹ 💕`,
    body: "Hôm nay chưa nối chuỗi nè, lưu một khoảnh khắc nhé!",
    data: { source: "nudge", sender_id: user.id },
  });

  return jsonResponse({
    sent: sent > 0,
    pushCount: sent,
    failedCount: failed.length,
    subscriptionCount: rows.length,
  });
});
