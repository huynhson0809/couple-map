// Supabase Edge Function: send-streak-reminders
// Intended schedule: run hourly. The function sends only at 12:00, 20:00, 22:00, and 23:00
// in Asia/Ho_Chi_Minh when today's couple streak is not completed.
//
// Deploy: supabase functions deploy send-streak-reminders --no-verify-jwt
// Env vars needed: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Optional Gemini env: GEMINI_API_KEY or GOOGLE_API_KEY. Optional model: GEMINI_MODEL.
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

const REMINDER_HOURS = [12, 20, 22, 23];
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

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

  if (!youPosted && !partnerPosted) {
    return "Pinly còn chỗ trống, hai bạn ghé ký gửi một miếng hôm nay nhé.";
  }

  if (!youPosted) {
    return "Người ấy gửi rồi, góc của bạn còn trống như ly trà chưa topping.";
  }

  if (!partnerPosted) {
    return "Bạn gửi rồi, Pinly để dành một ghế nhỏ cho người ấy ghé.";
  }

  return "Hai mẩu hôm nay đã đủ, Pinly đóng album lại thật nhẹ nhàng.";
}

type ReminderState = "both_missing" | "you_missing" | "partner_missing" | "waiting";

function reminderState(streak: CoupleStreakRow, recipientSlot: "user_a" | "user_b"): ReminderState {
  const youPosted =
    recipientSlot === "user_a" ? streak.today_user_a_posted : streak.today_user_b_posted;
  const partnerPosted =
    recipientSlot === "user_a" ? streak.today_user_b_posted : streak.today_user_a_posted;

  if (!youPosted && !partnerPosted) {
    return "both_missing";
  }

  if (!youPosted) {
    return "you_missing";
  }

  if (!partnerPosted) {
    return "partner_missing";
  }

  return "waiting";
}

const REMINDER_TEMPLATES: Record<ReminderState, string[]> = {
  both_missing: [
    "Pinly còn trống hôm nay, hai bạn ghé gửi chút gì vui vui nhé.",
    "Album hôm nay hơi yên, có khoảnh khắc nào muốn khoe không nè?",
    "Một miếng memory nhỏ cũng đủ làm hôm nay bớt nhạt rồi đó.",
    "Pinly đang pha trà, chờ hai bạn mang chuyện nhỏ tới kể.",
    "Hôm nay chưa có dấu chân, Pinly ngồi canh cửa hơi lâu rồi.",
    "Có gì đáng cười hôm nay không, Pinly xin một miếng làm kỷ niệm.",
    "Ngày hôm nay còn trắng tinh, hai bạn tô nhẹ một nét nha.",
    "Pinly mở sẵn album, chờ hai nhân vật chính xuất hiện nhẹ nhàng.",
    "Khoảnh khắc nhỏ cũng được, miễn sau này nhìn lại thấy thương.",
    "Hôm nay còn chỗ đẹp, hai bạn đặt một memory vào nha.",
  ],
  you_missing: [
    "Người ấy gửi rồi, góc của bạn còn trống như bánh chưa nhân.",
    "Partner đã thả một mẩu, Pinly để dành sân khấu nhỏ cho bạn.",
    "Một nửa album sáng rồi, phần của bạn đang ngồi đợi rất ngoan.",
    "Người ấy có memory rồi, bạn có miếng nào dễ thương bỏ túi không?",
    "Pinly nhận phần người ấy, giờ hóng chút chuyện nhỏ từ bạn.",
    "Góc của bạn còn trống, không áp lực, chỉ hơi tò mò thôi.",
    "Người ấy đã lên sóng nhẹ, bạn cameo một khoảnh khắc được không?",
    "Một mẩu từ bạn nữa là hôm nay nhìn tròn trịa hơn hẳn.",
    "Pinly giữ ghế cho bạn, ghế đẹp, view nhìn về hôm nay.",
    "Partner đã gửi tín hiệu, Pinly đang chờ phiên bản của bạn.",
  ],
  partner_missing: [
    "Bạn gửi rồi, Pinly để dành ghế cạnh bên cho người ấy.",
    "Memory của bạn đã tới, phần người ấy đang được giữ chỗ đẹp.",
    "Bạn tô một nét rồi, chờ người ấy thêm màu cho vui.",
    "Pinly nhận mẩu của bạn, giờ lắng nghe xem người ấy có gì.",
    "Hôm nay có phần của bạn rồi, phần người ấy chắc đang make-up.",
    "Bạn đã cất một mẩu, Pinly giữ cửa cho người ấy ghé.",
    "Một nửa album đã sáng, nửa kia chờ người ấy bước vào.",
    "Bạn gửi tín hiệu rồi, Pinly chờ tín hiệu đáp lại dễ thương.",
    "Hôm nay đã có dấu của bạn, còn một dấu nhỏ bên cạnh.",
    "Mẩu của bạn nằm yên rồi, người ấy thêm nữa là đẹp đôi.",
  ],
  waiting: [
    "Hôm nay gần đủ hai mẩu rồi, Pinly đang kê thêm ghế nhỏ.",
    "Còn một mảnh nữa thôi, album hôm nay sẽ cười rất tươi.",
    "Pinly đang giữ chỗ cuối, ai ghé trước cũng được nha.",
  ],
};

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeReminderText(text: string) {
  return text
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function statePromptLabel(state: ReminderState) {
  if (state === "both_missing") {
    return "cả hai chưa lưu khoảnh khắc hôm nay";
  }
  if (state === "you_missing") {
    return "người ấy đã lưu, người nhận thông báo chưa lưu";
  }
  if (state === "partner_missing") {
    return "người nhận đã lưu, người ấy chưa lưu";
  }
  return "hôm nay gần đủ hai mẩu kỷ niệm";
}

function buildGeminiPrompt(state: ReminderState, streak: CoupleStreakRow) {
  return [
    "Viết đúng 1 câu push notification tiếng Việt cho app Pinly.",
    "Độ dài 12-15 từ, hài hước, ấm áp, tự nhiên.",
    "App dùng để lưu khoảnh khắc của cặp đôi, không phải task manager.",
    "Không tạo cảm giác nhiệm vụ, deadline, bắt buộc, KPI.",
    "Không dùng ngoặc kép, hashtag, markdown, xuống dòng.",
    "Không dùng các từ: phải, bắt buộc, nhiệm vụ, deadline.",
    `Bối cảnh: ${statePromptLabel(state)}.`,
    `Chuỗi hiện tại: ${streak.current_count || 0} ngày.`,
  ].join(" ");
}

function extractGeminiText(data: unknown) {
  const response = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function geminiReminderBody(streak: CoupleStreakRow, recipientSlot: "user_a" | "user_b") {
  const apiKey =
    Deno.env.get("GEMINI_API_KEY") ||
    Deno.env.get("GOOGLE_API_KEY") ||
    Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) return null;

  const model = Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const state = reminderState(streak, recipientSlot);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildGeminiPrompt(state, streak) }] }],
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 48,
          candidateCount: 1,
        },
      }),
    },
  );

  if (!response.ok) {
    console.error("Gemini reminder error:", response.status, await response.text());
    return null;
  }

  const text = normalizeReminderText(extractGeminiText(await response.json()));
  const words = wordCount(text);
  if (!text || words < 10 || words > 18 || /phải|bắt buộc|nhiệm vụ|deadline/i.test(text)) {
    return null;
  }

  return text;
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function templateReminderBody(
  streak: CoupleStreakRow,
  recipientSlot: "user_a" | "user_b",
  recipientId: string,
  reminderDate: string,
  reminderHour: number,
) {
  const state = reminderState(streak, recipientSlot);
  const templates = REMINDER_TEMPLATES[state];
  if (!templates?.length) return bodyForRecipient(streak, recipientSlot);

  const seed = `${streak.couple_id}:${recipientId}:${recipientSlot}:${reminderDate}:${reminderHour}:${streak.current_count}:${state}`;
  const text = templates[hashString(seed) % templates.length];
  return text.replace("{count}", String(streak.current_count || 0));
}

async function generateReminderBody(
  streak: CoupleStreakRow,
  recipientSlot: "user_a" | "user_b",
  recipientId: string,
  reminderDate: string,
  reminderHour: number,
) {
  const aiText = await geminiReminderBody(streak, recipientSlot).catch((err) => {
    console.error("Gemini reminder failed:", err);
    return null;
  });

  return aiText ?? templateReminderBody(
    streak,
    recipientSlot,
    recipientId,
    reminderDate,
    reminderHour,
  );
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

    if (!force && !REMINDER_HOURS.includes(reminderHour)) {
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
        const notificationBody = await generateReminderBody(
          streak,
          recipient.slot,
          recipient.userId,
          reminderDate,
          reminderHour,
        );
        const payload = JSON.stringify({
          title: "🔥 Pinly nhắc nhẹ",
          body: notificationBody,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          data: { url: "/wishlist" },
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
