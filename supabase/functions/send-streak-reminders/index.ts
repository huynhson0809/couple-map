// Supabase Edge Function: send-streak-reminders
// Intended schedule: run hourly. The function sends only at 12:00, 20:00, 22:00, and 23:00
// in Asia/Ho_Chi_Minh when today's couple streak is not completed.
//
// Deploy: supabase functions deploy send-streak-reminders --no-verify-jwt
// Env vars needed: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Optional Gemini env: GEMINI_API_KEY or GOOGLE_API_KEY. Optional model: GEMINI_MODEL.
// Optional email env: RESEND_API_KEY, STREAK_REMINDER_EMAIL_FROM, APP_URL.
// Env var needed for invocation auth: STREAK_REMINDER_SECRET. Pass it as x-streak-secret.
// Optional debug env: STREAK_REMINDER_DRY_RUN=true to generate/log without sending push.

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

type UserEmailRow = {
  email: string | null;
  display_name: string | null;
};

type EmailSendResult = {
  sent: number;
  skipped: boolean;
  reason?: string;
  toEmail?: string;
  emailSource?: "public_users" | "auth_users";
};

type CoupleStreakRow = {
  couple_id: string;
  current_count: number;
  today_date: string;
  today_user_a_posted: boolean;
  today_user_b_posted: boolean;
  today_completed: boolean;
};

type GeminiReminderResult =
  | {
      ok: true;
      model: string;
      text: string;
      words: number;
      attempt: number;
    }
  | {
      ok: false;
      model?: string;
      reason: string;
      attempt?: number;
      status?: number;
      rawText?: string;
      error?: string;
    };

type GeneratedReminder = {
  body: string;
  source: "gemini" | "template";
  state: ReminderState;
  gemini: GeminiReminderResult;
  templateBody?: string;
};

type DebugRecipient = {
  userId: string;
  slot: "user_a" | "user_b";
  source: GeneratedReminder["source"];
  state: ReminderState;
  body: string;
  gemini: GeminiReminderResult;
  sent: number;
  skipped: boolean;
  emailSent: number;
  emailSkipped: boolean;
  emailReason?: string;
  emailTo?: string;
  emailSource?: EmailSendResult["emailSource"];
  dryRun: boolean;
};

type DebugCouple = {
  coupleId: string;
  currentCount: number;
  todayDate: string;
  todayCompleted: boolean;
  todayUserAPosted: boolean;
  todayUserBPosted: boolean;
  logStatus: "created" | "dry_run" | "skipped_duplicate" | "missing_couple";
  recipients: DebugRecipient[];
};

type ReasonCounts = Record<string, number>;

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

function envFlag(name: string) {
  return ["1", "true", "yes", "on"].includes((Deno.env.get(name) ?? "").toLowerCase());
}

function requestValue(
  body: Record<string, unknown>,
  searchParams: URLSearchParams,
  headers: Headers,
  key: string,
) {
  return body[key] ?? searchParams.get(key) ?? headers.get(`x-${key}`);
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }

  return false;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function parseJsonBody(rawBody: string) {
  if (!rawBody.trim()) {
    return {
      body: {} as Record<string, unknown>,
      error: null as string | null,
      recovered: false,
    };
  }

  try {
    const parsed = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        body: parsed as Record<string, unknown>,
        error: null,
        recovered: false,
      };
    }

    return {
      body: {},
      error: "json_body_is_not_an_object",
      recovered: false,
    };
  } catch (err) {
    const originalError = (err as Error).message;
    const headerBodySeparator = rawBody.lastIndexOf("\r\n\r\n");
    const possibleBody = headerBodySeparator >= 0
      ? rawBody.slice(headerBodySeparator + 4).trim()
      : "";

    for (const candidate of [
      possibleBody,
      rawBody.slice(rawBody.indexOf("{"), rawBody.lastIndexOf("}") + 1),
    ]) {
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return {
            body: parsed as Record<string, unknown>,
            error: `recovered_from_malformed_body: ${originalError}`,
            recovered: true,
          };
        }
      } catch {
        // Try the next recovery candidate.
      }
    }

    return {
      body: {},
      error: originalError,
      recovered: false,
    };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const visibleName = name.length <= 2 ? `${name[0] ?? ""}*` : `${name.slice(0, 2)}***`;
  return `${visibleName}@${domain}`;
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

async function sendEmailToUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  subject: string,
  body: string,
): Promise<EmailSendResult> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("STREAK_REMINDER_EMAIL_FROM");
  if (!resendApiKey || !from) {
    return { sent: 0, skipped: true, reason: "missing_email_config" };
  }

  const { data: pref } = await supabase
    .from("notification_preferences")
    .select("streak_email_reminders")
    .eq("user_id", userId)
    .maybeSingle();

  if (!pref?.streak_email_reminders) {
    return { sent: 0, skipped: true, reason: "email_preference_disabled" };
  }

  const { data: user } = await supabase
    .from("users")
    .select("email, display_name")
    .eq("id", userId)
    .maybeSingle();

  const row = user as UserEmailRow | null;
  let toEmail = row?.email ?? null;
  let emailSource: EmailSendResult["emailSource"] | undefined = toEmail
    ? "public_users"
    : undefined;

  if (!toEmail) {
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError) {
      console.error("Streak email auth lookup error:", {
        userId,
        message: authError.message,
      });
    }
    toEmail = authUser?.user?.email ?? null;
    emailSource = toEmail ? "auth_users" : undefined;
  }

  if (!toEmail) {
    return { sent: 0, skipped: true, reason: "missing_user_email" };
  }

  const text = [
    body,
    "",
    "Mở Pinly để lưu một mẩu ký ức hôm nay:",
    `${Deno.env.get("APP_URL") || ""}/wishlist`,
  ].join("\n");
  const appUrl = `${Deno.env.get("APP_URL") || ""}/wishlist`;
  const html = [
    `<p>${escapeHtml(body)}</p>`,
    `<p><a href="${appUrl}">Mở Pinly</a> để lưu một mẩu ký ức hôm nay.</p>`,
  ].join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [toEmail],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const rawText = await response.text();
    console.error("Resend streak email error:", {
      status: response.status,
      rawText,
      userId,
    });
    return {
      sent: 0,
      skipped: true,
      reason: `resend_http_${response.status}`,
      toEmail: maskEmail(toEmail),
      emailSource,
    };
  }

  return {
    sent: 1,
    skipped: false,
    reason: undefined,
    toEmail: maskEmail(toEmail),
    emailSource,
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
    "Bạn là người viết microcopy cho app Pinly.",
    "Hãy trả về đúng 1 câu push notification tiếng Việt.",
    "Câu dài 12-15 từ, hài hước, ấm áp, tự nhiên.",
    "App dùng để lưu khoảnh khắc của cặp đôi, không phải task manager.",
    "Không tạo cảm giác nhiệm vụ, deadline, bắt buộc, KPI.",
    "Không giải thích, không mở đầu bằng lời xác nhận.",
    "Không dùng ngoặc kép, hashtag, markdown, emoji, xuống dòng.",
    "Không dùng các từ: phải, bắt buộc, nhiệm vụ, deadline.",
    `Bối cảnh: ${statePromptLabel(state)}.`,
    `Chuỗi hiện tại: ${streak.current_count || 0} ngày.`,
    "Ví dụ style: Pinly còn chiếc ghế trống, ai đem chuyện vui tới ngồi không?",
  ].join(" ");
}

function extractGeminiText(data: unknown) {
  const response = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function geminiReminderBody(
  streak: CoupleStreakRow,
  recipientSlot: "user_a" | "user_b",
): Promise<GeminiReminderResult> {
  const apiKey =
    Deno.env.get("GEMINI_API_KEY") ||
    Deno.env.get("GOOGLE_API_KEY") ||
    Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) {
    return { ok: false, reason: "missing_gemini_api_key" };
  }

  const model = Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const state = reminderState(streak, recipientSlot);

  let lastValidationFailure: GeminiReminderResult | null = null;

  for (const attempt of [1, 2]) {
    const prompt = attempt === 1
      ? buildGeminiPrompt(state, streak)
      : [
          buildGeminiPrompt(state, streak),
          "Lần trước câu quá ngắn. Lần này bắt buộc trả câu hoàn chỉnh 12-15 từ.",
          "Chỉ trả về câu cuối cùng, không thêm chữ Tuyệt, OK, hay giải thích.",
        ].join(" ");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.85,
            topP: 0.95,
            maxOutputTokens: 160,
            candidateCount: 1,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    if (!response.ok) {
      const rawText = await response.text();
      const result: GeminiReminderResult = {
        ok: false,
        model,
        reason: "gemini_http_error",
        attempt,
        status: response.status,
        rawText,
      };
      console.error("Gemini reminder error:", result);
      return result;
    }

    const text = normalizeReminderText(extractGeminiText(await response.json()));
    const words = wordCount(text);
    if (text && words >= 10 && words <= 18 && !/phải|bắt buộc|nhiệm vụ|deadline/i.test(text)) {
      return { ok: true, model, text, words, attempt };
    }

    lastValidationFailure = {
      ok: false,
      model,
      reason: "gemini_validation_failed",
      attempt,
      rawText: text,
    };
  }

  return lastValidationFailure ?? {
    ok: false,
    model,
    reason: "gemini_validation_failed",
  };
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
): Promise<GeneratedReminder> {
  const state = reminderState(streak, recipientSlot);
  const gemini = await geminiReminderBody(streak, recipientSlot).catch((err) => {
    console.error("Gemini reminder failed:", err);
    return {
      ok: false,
      reason: "gemini_request_failed",
      error: (err as Error).message,
    } satisfies GeminiReminderResult;
  });

  if (gemini.ok) {
    return {
      body: gemini.text,
      source: "gemini",
      state,
      gemini,
    };
  }

  const templateBody = templateReminderBody(
    streak,
    recipientSlot,
    recipientId,
    reminderDate,
    reminderHour,
  );

  return {
    body: templateBody,
    source: "template",
    state,
    gemini,
    templateBody,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get("STREAK_REMINDER_SECRET");
    if (!secret) {
      return new Response(JSON.stringify({ error: "Missing STREAK_REMINDER_SECRET" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (req.headers.get("x-streak-secret") !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestUrl = new URL(req.url);
    const rawBody = req.method === "POST" ? await req.text() : "";
    const parsedBody = parseJsonBody(rawBody);
    const body = parsedBody.body;
    const now = localParts();
    const reminderDate = stringValue(
      requestValue(body, requestUrl.searchParams, req.headers, "date"),
      now.date,
    );
    const reminderHour = numberValue(
      requestValue(body, requestUrl.searchParams, req.headers, "hour"),
      now.hour,
    );
    const force = booleanValue(requestValue(body, requestUrl.searchParams, req.headers, "force"));
    const debug = booleanValue(requestValue(body, requestUrl.searchParams, req.headers, "debug"));
    const envDryRun = envFlag("STREAK_REMINDER_DRY_RUN");
    const dryRun = envDryRun ||
      booleanValue(requestValue(body, requestUrl.searchParams, req.headers, "dryRun")) ||
      booleanValue(requestValue(body, requestUrl.searchParams, req.headers, "preview"));
    const includeDebug = dryRun || debug;

    if (!force && !REMINDER_HOURS.includes(reminderHour)) {
      return new Response(JSON.stringify({
        message: "Outside reminder window",
        date: reminderDate,
        hour: reminderHour,
        force,
        received: {
          method: req.method,
          contentType: req.headers.get("content-type"),
          contentLength: req.headers.get("content-length"),
          bodyParseError: parsedBody.error,
          bodyRecovered: parsedBody.recovered,
          bodyKeys: Object.keys(body),
          bodyForce: body.force ?? null,
          queryForce: requestUrl.searchParams.get("force"),
          headerForce: req.headers.get("x-force"),
          bodyHour: body.hour ?? null,
          queryHour: requestUrl.searchParams.get("hour"),
          headerHour: req.headers.get("x-hour"),
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!dryRun) {
      const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
      const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
      const VAPID_SUBJECT =
        Deno.env.get("VAPID_SUBJECT") || "mailto:hello@pinly.app";

      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    }
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
    let emailSent = 0;
    let emailSkipped = 0;
    const emailReasons: ReasonCounts = {};
    const debugCouples: DebugCouple[] = [];

    for (const streak of ((streakRows ?? []) as CoupleStreakRow[])) {
      const debugCouple: DebugCouple = {
        coupleId: streak.couple_id,
        currentCount: streak.current_count,
        todayDate: streak.today_date,
        todayCompleted: streak.today_completed,
        todayUserAPosted: streak.today_user_a_posted,
        todayUserBPosted: streak.today_user_b_posted,
        logStatus: dryRun ? "dry_run" : "created",
        recipients: [],
      };

      if (!dryRun) {
        const { error: logError } = await supabase
          .from("streak_reminder_logs")
          .insert({
            couple_id: streak.couple_id,
            reminder_date: reminderDate,
            reminder_hour: reminderHour,
          });

        if (logError) {
          skipped += 1;
          debugCouple.logStatus = "skipped_duplicate";
          debugCouples.push(debugCouple);
          continue;
        }
      }

      const { data: couple } = await supabase
        .from("couples")
        .select("user_a,user_b")
        .eq("id", streak.couple_id)
        .single();

      if (!couple?.user_a || !couple?.user_b) {
        skipped += 1;
        debugCouple.logStatus = "missing_couple";
        debugCouples.push(debugCouple);
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
          body: notificationBody.body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          data: { url: "/wishlist" },
        });

        console.log("streak reminder generated", {
          dryRun,
          coupleId: streak.couple_id,
          recipientSlot: recipient.slot,
          recipientId: recipient.userId,
          source: notificationBody.source,
          state: notificationBody.state,
          body: notificationBody.body,
          gemini: notificationBody.gemini,
        });

        const result = dryRun
          ? { sent: 0, skipped: false }
          : await sendToUser(supabase, recipient.userId, payload);
        sent += result.sent;
        if (result.skipped) skipped += 1;

        const emailResult = dryRun
          ? { sent: 0, skipped: false, reason: "dry_run" }
          : await sendEmailToUser(
              supabase,
              recipient.userId,
              "Pinly nhắc nhẹ",
              notificationBody.body,
            );
        emailSent += emailResult.sent;
        if (emailResult.skipped) {
          emailSkipped += 1;
          const reason = emailResult.reason ?? "unknown";
          emailReasons[reason] = (emailReasons[reason] ?? 0) + 1;
        }

        debugCouple.recipients.push({
          userId: recipient.userId,
          slot: recipient.slot,
          source: notificationBody.source,
          state: notificationBody.state,
          body: notificationBody.body,
          gemini: notificationBody.gemini,
          sent: result.sent,
          skipped: result.skipped,
          emailSent: emailResult.sent,
          emailSkipped: emailResult.skipped,
          emailReason: emailResult.reason,
          emailTo: emailResult.toEmail,
          emailSource: emailResult.emailSource,
          dryRun,
        });
      }

      debugCouples.push(debugCouple);
    }

    return new Response(
      JSON.stringify({
        message: "Streak reminders processed",
        date: reminderDate,
        hour: reminderHour,
        dryRun,
        dryRunSource: envDryRun ? "env" : dryRun ? "request" : null,
        couples: streakRows?.length ?? 0,
        sent,
        skipped,
        emailSent,
        emailSkipped,
        emailReasons,
        ...(includeDebug ? { debug: debugCouples } : {}),
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
