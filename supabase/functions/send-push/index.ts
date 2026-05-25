// Supabase Edge Function: send-push
// Triggered by DB webhook on pins INSERT or directly by the app for interactions.
// Reads recipient's push subscriptions and sends Web Push notification.
//
// Deploy: supabase functions deploy send-push --no-verify-jwt
// Env vars needed: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { record } = body;
    const eventType = String(body.event_type || body.type || "memory_added");

    if (!record) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT =
      Deno.env.get("VAPID_SUBJECT") || "mailto:hello@pinly.app";

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let recipientId: string | null = null;
    let actorId: string | null = null;
    const notificationKind: "memory_added" | "reactions" | "comments" =
      eventType === "reaction" ? "reactions" :
      eventType === "comment" || eventType === "comment_reply" || eventType === "comment_reaction" ? "comments" :
      "memory_added";
    let pinTitle = record.title || "một kỷ niệm";
    let pinId = record.id || record.pin_id;
    let interactionBody: string | null = record.body ? String(record.body) : null;

    if (eventType === "reaction" || eventType === "comment") {
      actorId = record.user_id;
      if (!record.pin_id || !actorId) {
        return new Response(JSON.stringify({ error: "Invalid interaction payload" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: pin } = await supabase
        .from("pins")
        .select("id,title,created_by")
        .eq("id", record.pin_id)
        .single();

      if (!pin) {
        return new Response(JSON.stringify({ error: "Pin not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      recipientId = pin.created_by;
      pinTitle = pin.title || pinTitle;
      pinId = pin.id;
    } else if (eventType === "comment_reply") {
      actorId = record.user_id;
      if (!record.pin_id || !record.parent_comment_id || !actorId) {
        return new Response(JSON.stringify({ error: "Invalid comment reply payload" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [{ data: pin }, { data: parentComment }] = await Promise.all([
        supabase
          .from("pins")
          .select("id,title,created_by")
          .eq("id", record.pin_id)
          .single(),
        supabase
          .from("pin_comments")
          .select("id,user_id,body")
          .eq("id", record.parent_comment_id)
          .single(),
      ]);

      if (!pin) {
        return new Response(JSON.stringify({ error: "Pin not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      recipientId = parentComment?.user_id ?? pin.created_by;
      pinTitle = pin.title || pinTitle;
      pinId = pin.id;
    } else if (eventType === "comment_reaction") {
      actorId = record.user_id;
      if (!record.comment_id || !actorId) {
        return new Response(JSON.stringify({ error: "Invalid comment reaction payload" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: comment } = await supabase
        .from("pin_comments")
        .select("id,pin_id,user_id,body")
        .eq("id", record.comment_id)
        .single();

      if (!comment) {
        return new Response(JSON.stringify({ error: "Comment not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: pin } = await supabase
        .from("pins")
        .select("id,title")
        .eq("id", comment.pin_id)
        .single();

      recipientId = comment.user_id;
      pinTitle = pin?.title || pinTitle;
      pinId = comment.pin_id;
      interactionBody = String(comment.body || "");
    } else {
      actorId = record.created_by;
      if (!record.couple_id || !actorId) {
        return new Response(JSON.stringify({ error: "Invalid pin payload" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: couple } = await supabase
        .from("couples")
        .select("user_a, user_b")
        .eq("id", record.couple_id)
        .single();

      if (!couple) {
        return new Response(JSON.stringify({ error: "Couple not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      recipientId = couple.user_a === actorId ? couple.user_b : couple.user_a;
    }

    if (!recipientId || recipientId === actorId) {
      return new Response(JSON.stringify({ message: "No recipient" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pref } = await supabase
      .from("notification_preferences")
      .select("memory_added,reactions,comments")
      .eq("user_id", recipientId)
      .maybeSingle();

    if (pref && pref[notificationKind] === false) {
      return new Response(JSON.stringify({ message: "Notification disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", recipientId);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push subscriptions for partner" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get creator's display name
    const { data: creator } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", actorId)
      .single();

    const creatorName = creator?.display_name || "Người yêu";
    const reaction = record.reaction || "love";
    const bodyPreview = interactionBody ? `“${interactionBody.slice(0, 80)}”` : pinTitle;

    const title =
      eventType === "reaction"
        ? `💞 ${creatorName} đã bày tỏ cảm xúc`
        : eventType === "comment"
          ? `💬 ${creatorName} đã bình luận`
          : eventType === "comment_reply"
            ? `↩️ ${creatorName} đã trả lời bình luận`
            : eventType === "comment_reaction"
              ? `💞 ${creatorName} đã thả tim bình luận`
              : `📍 ${creatorName} đã ghim`;

    const notificationBody =
      eventType === "reaction"
        ? `${reaction} · ${pinTitle}`
        : eventType === "comment" || eventType === "comment_reply"
          ? bodyPreview
          : eventType === "comment_reaction"
            ? `${reaction} · ${bodyPreview}`
          : pinTitle;

    const notificationPayload = JSON.stringify({
      title,
      body: notificationBody,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: pinId ? `/?pin=${pinId}` : "/" },
    });

    // Send to all subscriptions
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

    // Clean up expired subscriptions (410 Gone)
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

    return new Response(
      JSON.stringify({
        message: "Push sent",
        sent,
        total: subscriptions.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
