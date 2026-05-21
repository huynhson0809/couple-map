// Supabase Edge Function: send-streak-reminders
// Intended schedule: run hourly. The function sends only at 22:00 and 23:00
// in Asia/Ho_Chi_Minh when today's couple streak is not completed.
//
// Deploy: supabase functions deploy send-streak-reminders --no-verify-jwt
// Env vars needed: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Optional env: STREAK_REMINDER_SECRET. If set, pass it as x-streak-secret.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-streak-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type CoupleStreakRow = {
  couple_id: string;
  current_count: number;
  today_date: string;
  today_user_a_posted: boolean;
  today_user_b_posted: boolean;
  today_completed: boolean;
};

function localParts(date = new Date(), timeZone = "Asia/Ho_Chi_Minh") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
  };
}

async function sendToUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  payload: string,
) {
  const { data: pref } = await supabase
    .from("notification_preferences")
    .select("streak_reminders")
    .eq("user_id", userId)
    .maybeSingle();

  if (pref && pref.streak_reminders === false) return { sent: 0, skipped: true };

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  const rows = (subscriptions ?? []) as PushSubscriptionRow[];
  if (rows.length === 0) return { sent: 0, skipped: true };

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

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected" && result.reason?.statusCode === 410) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", rows[i].endpoint);
    }
  }

  return {
    sent: results.filter((result) => result.status === "fulfilled").length,
    skipped: false,
  };
}

function bodyForRecipient(streak: CoupleStreakRow, recipientSlot: "user_a" | "user_b") {
  const youPosted =
    recipientSlot === "user_a" ? streak.today_user_a_posted : streak.today_user_b_posted;
  const partnerPosted =
    recipientSlot === "user_a" ? streak.today_user_b_posted : streak.today_user_a_posted;
  const countText = streak.current_count > 0 ? ` ${streak.current_count} ngày` : "";

  if (!youPosted && !partnerPosted) {
    return `Hôm nay hai bạn chưa đăng memory nào. Thêm kỷ niệm để giữ chuỗi${countText} nhé.`;
  }

  if (!youPosted) {
    return `Tới lượt bạn rồi. Đăng 1 memory trước khi hết ngày để giữ chuỗi${countText}.`;
  }

  if (!partnerPosted) {
    return `Còn thiếu memory của người ấy để nối chuỗi${countText}. Nhắc nhẹ nhau nha.`;
  }

  return "Chuỗi hôm nay đang chờ được nối.";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get("STREAK_REMINDER_SECRET");
    if (secret && req.headers.get("x-streak-secret") !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const now = localParts();
    const reminderDate = body.date || now.date;
    const reminderHour = Number.isFinite(Number(body.hour)) ? Number(body.hour) : now.hour;
    const force = body.force === true;

    if (!force && reminderHour !== 22 && reminderHour !== 23) {
      return new Response(JSON.stringify({ message: "Outside reminder window" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT =
      Deno.env.get("VAPID_SUBJECT") || "mailto:hello@pinly.app";

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: couplesForRefresh, error: couplesError } = await supabase
      .from("couples")
      .select("id")
      .not("user_b", "is", null);

    if (couplesError) throw couplesError;

    await Promise.all(
      (couplesForRefresh ?? []).map((couple) =>
        supabase.rpc("refresh_couple_streak", { target_couple_id: couple.id }),
      ),
    );

    const { data: streakRows, error: streakError } = await supabase
      .from("couple_streaks")
      .select(
        "couple_id,current_count,today_date,today_user_a_posted,today_user_b_posted,today_completed",
      )
      .eq("today_date", reminderDate)
      .eq("today_completed", false);

    if (streakError) throw streakError;

    let sent = 0;
    let skipped = 0;

    for (const streak of ((streakRows ?? []) as CoupleStreakRow[])) {
      const { error: logError } = await supabase
        .from("streak_reminder_logs")
        .insert({
          couple_id: streak.couple_id,
          reminder_date: reminderDate,
          reminder_hour: reminderHour,
        });

      if (logError) {
        skipped += 1;
        continue;
      }

      const { data: couple } = await supabase
        .from("couples")
        .select("user_a,user_b")
        .eq("id", streak.couple_id)
        .single();

      if (!couple?.user_a || !couple?.user_b) {
        skipped += 1;
        continue;
      }

      const recipients: Array<{ userId: string; slot: "user_a" | "user_b" }> = [
        { userId: couple.user_a, slot: "user_a" },
        { userId: couple.user_b, slot: "user_b" },
      ];

      for (const recipient of recipients) {
        const payload = JSON.stringify({
          title: "🔥 Pinly nhắc giữ chuỗi",
          body: bodyForRecipient(streak, recipient.slot),
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          data: { url: "/timeline" },
        });

        const result = await sendToUser(supabase, recipient.userId, payload);
        sent += result.sent;
        if (result.skipped) skipped += 1;
      }
    }

    return new Response(
      JSON.stringify({
        message: "Streak reminders processed",
        date: reminderDate,
        hour: reminderHour,
        couples: streakRows?.length ?? 0,
        sent,
        skipped,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-streak-reminders error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
