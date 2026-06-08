// Supabase Edge Function: send-push
// Sends Web Push for memory and interaction events.
//
// Deploy: supabase functions deploy send-push --no-verify-jwt
// Env vars needed: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// Optional env: SEND_PUSH_SECRET. If set, DB webhooks may pass it as x-send-push-secret.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-send-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EventType =
  | "memory_added"
  | "reaction"
  | "comment"
  | "comment_reply"
  | "comment_reaction";

type NotificationKind = "memory_added" | "reactions" | "comments";

type EventContext = {
  eventType: EventType;
  notificationKind: NotificationKind;
  eventKey: string;
  actorId: string;
  recipientId: string | null;
  pinId: string | null;
  pinTitle: string;
  interactionBody: string | null;
  reaction: string;
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

function eventTypeFromBody(value: unknown): EventType {
  const eventType = String(value || "memory_added");
  if (
    eventType === "reaction" ||
    eventType === "comment" ||
    eventType === "comment_reply" ||
    eventType === "comment_reaction"
  ) {
    return eventType;
  }
  return "memory_added";
}

function notificationKindForEvent(eventType: EventType): NotificationKind {
  if (eventType === "reaction") return "reactions";
  if (
    eventType === "comment" ||
    eventType === "comment_reply" ||
    eventType === "comment_reaction"
  ) {
    return "comments";
  }
  return "memory_added";
}

function isUuid(value: unknown) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function requireUuid(value: unknown, label: string) {
  if (!isUuid(value)) throw new Error(`Invalid ${label}`);
  return value as string;
}

async function getAuthenticatedUserId(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
) {
  const token = getBearerToken(req);
  if (!token) return null;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

async function assertActorAllowed(
  actorId: string,
  authenticatedUserId: string | null,
  trustedWebhook: boolean,
) {
  if (trustedWebhook) return;
  if (!authenticatedUserId)
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  if (actorId !== authenticatedUserId)
    throw Object.assign(new Error("Forbidden actor"), { status: 403 });
}

async function loadEventContext(
  supabase: ReturnType<typeof createClient>,
  eventType: EventType,
  record: Record<string, unknown>,
  authenticatedUserId: string | null,
  trustedWebhook: boolean,
): Promise<EventContext> {
  const notificationKind = notificationKindForEvent(eventType);

  if (eventType === "memory_added") {
    const pinId = requireUuid(record.id, "pin id");
    const { data: pin } = await supabase
      .from("pins")
      .select("id,title,couple_id,created_by,created_at")
      .eq("id", pinId)
      .single();
    if (!pin) throw Object.assign(new Error("Pin not found"), { status: 404 });

    await assertActorAllowed(
      pin.created_by,
      authenticatedUserId,
      trustedWebhook,
    );

    const { data: couple } = await supabase
      .from("couples")
      .select("user_a,user_b")
      .eq("id", pin.couple_id)
      .single();
    if (!couple)
      throw Object.assign(new Error("Couple not found"), { status: 404 });

    const recipientId =
      couple.user_a === pin.created_by ? couple.user_b : couple.user_a;
    return {
      eventType,
      notificationKind,
      eventKey: `memory_added:${pin.id}:${pin.created_at}:${recipientId ?? "none"}`,
      actorId: pin.created_by,
      recipientId,
      pinId: pin.id,
      pinTitle: pin.title || "một kỷ niệm",
      interactionBody: null,
      reaction: "love",
    };
  }

  if (eventType === "reaction") {
    const pinId = requireUuid(record.pin_id, "pin id");
    const actorId = requireUuid(record.user_id, "user id");
    await assertActorAllowed(actorId, authenticatedUserId, trustedWebhook);

    const [{ data: reactionRow }, { data: pin }] = await Promise.all([
      supabase
        .from("pin_reactions")
        .select("pin_id,user_id,reaction,created_at")
        .eq("pin_id", pinId)
        .eq("user_id", actorId)
        .single(),
      supabase
        .from("pins")
        .select("id,title,created_by")
        .eq("id", pinId)
        .single(),
    ]);
    if (!reactionRow || !pin)
      throw Object.assign(new Error("Reaction not found"), { status: 404 });

    return {
      eventType,
      notificationKind,
      eventKey: `reaction:${pinId}:${actorId}:${reactionRow.reaction}:${reactionRow.created_at}`,
      actorId,
      recipientId: pin.created_by,
      pinId,
      pinTitle: pin.title || "một kỷ niệm",
      interactionBody: null,
      reaction: reactionRow.reaction || "love",
    };
  }

  if (eventType === "comment" || eventType === "comment_reply") {
    const commentId = requireUuid(record.id, "comment id");
    const { data: comment } = await supabase
      .from("pin_comments")
      .select("id,pin_id,user_id,body,parent_comment_id")
      .eq("id", commentId)
      .single();
    if (!comment)
      throw Object.assign(new Error("Comment not found"), { status: 404 });

    await assertActorAllowed(
      comment.user_id,
      authenticatedUserId,
      trustedWebhook,
    );

    const [{ data: pin }, parentResult] = await Promise.all([
      supabase
        .from("pins")
        .select("id,title,created_by")
        .eq("id", comment.pin_id)
        .single(),
      comment.parent_comment_id
        ? supabase
            .from("pin_comments")
            .select("id,user_id")
            .eq("id", comment.parent_comment_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);
    if (!pin) throw Object.assign(new Error("Pin not found"), { status: 404 });

    // Determine recipient: prefer parent comment author, but if that's the actor, fall back to pin creator
    let recipientId = parentResult.data?.user_id ?? pin.created_by;
    if (recipientId === comment.user_id) {
      recipientId = pin.created_by;
    }

    return {
      eventType: comment.parent_comment_id ? "comment_reply" : "comment",
      notificationKind,
      eventKey: `${comment.parent_comment_id ? "comment_reply" : "comment"}:${comment.id}`,
      actorId: comment.user_id,
      recipientId,
      pinId: pin.id,
      pinTitle: pin.title || "một kỷ niệm",
      interactionBody: String(comment.body || ""),
      reaction: "love",
    };
  }

  const commentId = requireUuid(record.comment_id, "comment id");
  const actorId = requireUuid(record.user_id, "user id");
  await assertActorAllowed(actorId, authenticatedUserId, trustedWebhook);

  const [{ data: reactionRow }, { data: comment }] = await Promise.all([
    supabase
      .from("pin_comment_reactions")
      .select("comment_id,user_id,reaction,created_at")
      .eq("comment_id", commentId)
      .eq("user_id", actorId)
      .single(),
    supabase
      .from("pin_comments")
      .select("id,pin_id,user_id,body")
      .eq("id", commentId)
      .single(),
  ]);
  if (!reactionRow || !comment) {
    throw Object.assign(new Error("Comment reaction not found"), {
      status: 404,
    });
  }

  const { data: pin } = await supabase
    .from("pins")
    .select("id,title")
    .eq("id", comment.pin_id)
    .single();

  return {
    eventType,
    notificationKind,
    eventKey: `comment_reaction:${commentId}:${actorId}:${reactionRow.reaction}:${reactionRow.created_at}`,
    actorId,
    recipientId: comment.user_id,
    pinId: comment.pin_id,
    pinTitle: pin?.title || "một kỷ niệm",
    interactionBody: String(comment.body || ""),
    reaction: reactionRow.reaction || "love",
  };
}

async function claimNotificationEvent(
  supabase: ReturnType<typeof createClient>,
  context: EventContext,
) {
  const { error } = await supabase.from("notification_delivery_events").insert({
    event_key: context.eventKey,
    event_type: context.eventType,
    actor_id: context.actorId,
    recipient_id: context.recipientId,
    pin_id: context.pinId,
  });

  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const record = body?.record as Record<string, unknown> | undefined;
    const eventType = eventTypeFromBody(body?.event_type || body?.type);
    if (!record || typeof record !== "object") {
      return jsonResponse({ error: "Invalid payload" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT =
      Deno.env.get("VAPID_SUBJECT") || "mailto:hello@pinly.app";
    const webhookSecret = Deno.env.get("SEND_PUSH_SECRET");
    const trustedWebhook =
      !!webhookSecret &&
      req.headers.get("x-send-push-secret") === webhookSecret;
    const authenticatedUserId = await getAuthenticatedUserId(
      req,
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
    );

    if (!trustedWebhook && !authenticatedUserId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const context = await loadEventContext(
      supabase,
      eventType,
      record,
      authenticatedUserId,
      trustedWebhook,
    );

    if (!context.recipientId || context.recipientId === context.actorId) {
      return jsonResponse({ message: "No recipient" });
    }

    const { data: allowed, error: rateError } = await supabase.rpc(
      "check_edge_rate_limit",
      {
        limit_key: `send-push:${context.actorId}`,
        window_seconds: 3600,
        max_requests: 240,
      },
    );
    if (rateError) throw rateError;
    if (allowed === false)
      return jsonResponse({ error: "Rate limit exceeded" }, 429);

    const claimed = await claimNotificationEvent(supabase, context);
    if (!claimed) {
      return jsonResponse({ message: "Duplicate notification skipped" });
    }

    const { data: pref } = await supabase
      .from("notification_preferences")
      .select("memory_added,reactions,comments")
      .eq("user_id", context.recipientId)
      .maybeSingle();

    if (pref && pref[context.notificationKind] === false) {
      return jsonResponse({ message: "Notification disabled" });
    }

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", context.recipientId);

    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse({ message: "No push subscriptions for partner" });
    }

    const { data: creator } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", context.actorId)
      .single();

    const creatorName = creator?.display_name || "Người yêu";
    const bodyPreview = context.interactionBody
      ? `“${context.interactionBody.slice(0, 80)}”`
      : context.pinTitle;

    const title =
      context.eventType === "reaction"
        ? `💞 ${creatorName} đã bày tỏ cảm xúc`
        : context.eventType === "comment"
          ? `💬 ${creatorName} đã bình luận`
          : context.eventType === "comment_reply"
            ? `↩️ ${creatorName} đã trả lời bình luận`
            : context.eventType === "comment_reaction"
              ? `💞 ${creatorName} đã bày tỏ cảm xúc với bình luận`
              : `📍 ${creatorName} đã ghim`;

    const notificationBody =
      context.eventType === "reaction"
        ? `${context.reaction} · ${context.pinTitle}`
        : context.eventType === "comment" ||
            context.eventType === "comment_reply"
          ? bodyPreview
          : context.eventType === "comment_reaction"
            ? `${context.reaction} · ${bodyPreview}`
            : context.pinTitle;

    const notificationPayload = JSON.stringify({
      title,
      body: notificationBody,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: context.pinId ? `/?pin=${context.pinId}` : "/" },
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notificationPayload,
        ),
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected" && result.reason?.statusCode === 410) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", subscriptions[i].endpoint);
      }
    }

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return jsonResponse({
      message: "Push sent",
      sent,
      total: subscriptions.length,
    });
  } catch (err) {
    const status =
      typeof (err as { status?: unknown }).status === "number"
        ? (err as { status: number }).status
        : 500;
    console.error("send-push error:", err);
    return jsonResponse(
      {
        error:
          status === 500 ? "Internal server error" : (err as Error).message,
      },
      status,
    );
  }
});
