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

type SupabaseClient = ReturnType<typeof createClient>;

type StreakSlot = "user_a" | "user_b";

type CoupleRow = {
  id: string;
  user_a: string;
  user_b: string | null;
};

type CoupleStreakRow = {
  today_user_a_posted: boolean;
  today_user_b_posted: boolean;
  today_completed: boolean;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function hasPostedToday(streak: CoupleStreakRow, slot: StreakSlot) {
  return slot === "user_a"
    ? streak.today_user_a_posted
    : streak.today_user_b_posted;
}

async function logNudge(
  supabase: SupabaseClient,
  coupleId: string,
  senderId: string,
  nudgeDate: string,
) {
  const { error } = await supabase.from("streak_nudge_logs").insert({
    couple_id: coupleId,
    sender_id: senderId,
    nudge_date: nudgeDate,
  });

  if (error) {
    console.error("Nudge log error:", error.message);
  }
}

async function insertNudgeNotification(
  supabase: SupabaseClient,
  params: {
    partnerId: string;
    coupleId: string;
    senderId: string;
    title: string;
    body: string;
  },
) {
  const { error } = await supabase.from("notifications").insert({
    user_id: params.partnerId,
    couple_id: params.coupleId,
    type: "streak_reminder",
    title: params.title,
    body: params.body,
    data: {
      source: "nudge",
      sender_id: params.senderId,
      url: "/wishlist",
    },
  });

  if (error) {
    throw new Error(`Failed to insert nudge notification: ${error.message}`);
  }
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

  const coupleRow = couple as CoupleRow;
  const senderSlot: StreakSlot =
    coupleRow.user_a === user.id ? "user_a" : "user_b";
  const partnerSlot: StreakSlot = senderSlot === "user_a" ? "user_b" : "user_a";
  const partnerId =
    senderSlot === "user_a" ? coupleRow.user_b : coupleRow.user_a;
  if (!partnerId) {
    return jsonResponse({ error: "Partner not found" }, 404);
  }

  const { data: streak, error: streakError } = await supabase.rpc(
    "refresh_couple_streak",
    { target_couple_id: coupleRow.id },
  );

  if (streakError || !streak) {
    console.error("Nudge streak check error:", streakError?.message);
    return jsonResponse({ error: "Could not check streak status" }, 500);
  }

  const streakRow = (Array.isArray(streak) ? streak[0] : streak) as
    | CoupleStreakRow
    | undefined;
  if (!streakRow) {
    return jsonResponse({ error: "Could not check streak status" }, 500);
  }

  const senderPosted = hasPostedToday(streakRow, senderSlot);
  const partnerPosted = hasPostedToday(streakRow, partnerSlot);

  if (streakRow.today_completed || partnerPosted) {
    return jsonResponse({
      sent: false,
      reason: "partner_already_posted",
    });
  }

  if (!senderPosted) {
    return jsonResponse({
      sent: false,
      reason: "sender_not_posted",
    });
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
    .eq("couple_id", coupleRow.id)
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
    await logNudge(supabase, coupleRow.id, user.id, vnToday);
    return jsonResponse({ sent: false, reason: "partner_disabled_reminders" });
  }

  // Get sender's display name
  const { data: senderProfile } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const senderName = senderProfile?.display_name ?? "Người ấy";
  const title = `${senderName} nhắc nhẹ 💕`;
  const body = "Hôm nay chưa nối chuỗi nè, lưu một khoảnh khắc nhé!";

  await insertNudgeNotification(supabase, {
    partnerId,
    coupleId: coupleRow.id,
    senderId: user.id,
    title,
    body,
  });

  // Get partner's push subscriptions
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", partnerId);

  const rows = (subscriptions ?? []) as PushSubscriptionRow[];

  if (rows.length === 0) {
    await logNudge(supabase, coupleRow.id, user.id, vnToday);
    return jsonResponse({
      sent: true,
      inAppSent: true,
      pushCount: 0,
      failedCount: 0,
      reason: "no_push_subscriptions",
      debug: { partnerId, subscriptionCount: 0 },
    });
  }

  // Build push payload
  const payload = JSON.stringify({
    title,
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { type: "streak_nudge", url: "/wishlist" },
  });

  // Configure web push
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@pinly.app";
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error("Nudge push skipped: missing VAPID keys");
    await logNudge(supabase, coupleRow.id, user.id, vnToday);
    return jsonResponse({
      sent: true,
      inAppSent: true,
      pushCount: 0,
      failedCount: rows.length,
      subscriptionCount: rows.length,
      reason: "push_not_configured",
    });
  }
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

  await logNudge(supabase, coupleRow.id, user.id, vnToday);

  return jsonResponse({
    sent: true,
    inAppSent: true,
    pushCount: sent,
    failedCount: failed.length,
    subscriptionCount: rows.length,
  });
});
