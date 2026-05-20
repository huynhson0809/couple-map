// Supabase Edge Function: send-push
// Triggered by DB webhook on pins INSERT.
// Reads partner's push subscriptions and sends Web Push notification.
//
// Deploy: supabase functions deploy send-push --no-verify-jwt
// Env vars needed: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "npm:web-push@3.6.7";

serve(async (req) => {
  try {
    const body = await req.json();
    const { record } = body;

    if (!record || !record.couple_id || !record.created_by) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT =
      Deno.env.get("VAPID_SUBJECT") || "mailto:hello@mapmate.app";

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find partner's user_id in the couple
    const { data: couple } = await supabase
      .from("couples")
      .select("user_a, user_b")
      .eq("id", record.couple_id)
      .single();

    if (!couple) {
      return new Response(JSON.stringify({ error: "Couple not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const partnerId =
      couple.user_a === record.created_by ? couple.user_b : couple.user_a;

    if (!partnerId) {
      return new Response(JSON.stringify({ message: "No partner yet" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get partner's push subscriptions
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", partnerId);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push subscriptions for partner" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Get creator's display name
    const { data: creator } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", record.created_by)
      .single();

    const creatorName = creator?.display_name || "Người yêu";
    const pinTitle = record.title || "một địa điểm mới";

    const notificationPayload = JSON.stringify({
      title: `📍 ${creatorName} đã ghim`,
      body: pinTitle,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: "/" },
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
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
