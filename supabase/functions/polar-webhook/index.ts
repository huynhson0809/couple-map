import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { Webhooks } from "npm:@polar-sh/supabase";
import { adminClient } from "../_shared/auth-user.ts";
import { corsHeaders, jsonResponse } from "../_shared/billing-cors.ts";

type JsonRecord = Record<string, unknown>;

type PolarPayload = {
  id?: unknown;
  event_id?: unknown;
  eventId?: unknown;
  type?: unknown;
  timestamp?: unknown;
  data?: unknown;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function readString(source: JsonRecord | null, keys: string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function readIsoString(source: JsonRecord | null, keys: string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" && value.trim().length > 0) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }

  return null;
}

function metadataFrom(data: JsonRecord) {
  return asRecord(data.metadata);
}

function metadataUserId(data: JsonRecord) {
  return readString(metadataFrom(data), ["user_id", "userId"]);
}

function customerRecord(data: JsonRecord) {
  return asRecord(data.customer);
}

function externalCustomerIdFrom(data: JsonRecord) {
  return (
    readString(data, [
      "external_customer_id",
      "externalCustomerId",
      "external_id",
      "externalId",
    ]) ??
    readString(customerRecord(data), [
      "external_customer_id",
      "externalCustomerId",
      "external_id",
      "externalId",
    ])
  );
}

function polarCustomerIdFrom(data: JsonRecord) {
  return (
    readString(data, ["customer_id", "customerId"]) ??
    readString(customerRecord(data), ["id", "customer_id", "customerId"])
  );
}

function customerEmailFrom(data: JsonRecord) {
  const email =
    readString(data, ["customer_email", "customerEmail", "email"]) ??
    readString(customerRecord(data), ["email"]);

  return email ? email.toLowerCase() : null;
}

function productIdFrom(data: JsonRecord) {
  return (
    readString(data, ["product_id", "productId"]) ??
    readString(asRecord(data.product), ["id", "product_id", "productId"])
  );
}

function priceIdFrom(data: JsonRecord) {
  const prices = Array.isArray(data.prices) ? data.prices : [];
  const firstPrice = asRecord(prices[0]);

  return (
    readString(data, ["product_price_id", "price_id", "priceId"]) ??
    readString(firstPrice, ["id", "price_id", "priceId"])
  );
}

function planCycleFromProductId(productId: string | null) {
  if (!productId) return { plan: null, cycle: null };

  for (const plan of ["plus", "pro"] as const) {
    for (const cycle of ["monthly", "annual"] as const) {
      const key = `POLAR_${plan.toUpperCase()}_${cycle.toUpperCase()}_PRODUCT_ID`;
      if (Deno.env.get(key) === productId) return { plan, cycle };
    }
  }

  return { plan: null, cycle: null };
}

function planFromData(data: JsonRecord) {
  const value = readString(metadataFrom(data), ["plan"]);
  if (value === "plus" || value === "pro") return value;

  return planCycleFromProductId(productIdFrom(data)).plan;
}

function cycleFromData(data: JsonRecord) {
  const value = readString(metadataFrom(data), ["cycle", "billing_cycle"]);
  if (value === "monthly" || value === "annual") return value;

  const recurringInterval = readString(data, [
    "recurring_interval",
    "recurringInterval",
  ]);
  if (recurringInterval === "month") return "monthly";
  if (recurringInterval === "year") return "annual";

  return planCycleFromProductId(productIdFrom(data)).cycle;
}

function normalizeStatus(value: string | null) {
  if (
    value === "active" ||
    value === "trialing" ||
    value === "canceled" ||
    value === "expired" ||
    value === "revoked" ||
    value === "incomplete"
  ) {
    return value;
  }

  if (value === "past_due" || value === "unpaid") return "incomplete";

  return null;
}

function subscriptionStatus(eventType: string, data: JsonRecord) {
  if (eventType === "subscription.active") return "active";
  if (eventType === "subscription.canceled") return "canceled";
  if (eventType === "subscription.revoked") return "revoked";
  if (eventType === "subscription.past_due") return "incomplete";

  if (eventType.startsWith("subscription.")) {
    return normalizeStatus(readString(data, ["status"]));
  }

  return null;
}

function eventIdFrom(payload: PolarPayload, eventType: string, data: JsonRecord) {
  const payloadRecord = payload as JsonRecord;
  const explicitId = readString(payloadRecord, ["id", "event_id", "eventId"]);
  if (explicitId) return explicitId;

  const timestamp =
    readIsoString(payloadRecord, ["timestamp"]) ??
    readIsoString(data, ["modified_at", "modifiedAt"]);
  const dataId = readString(data, ["id"]);
  if (timestamp && dataId) return `${eventType}:${timestamp}:${dataId}`;

  throw new Error("missing_polar_event_id");
}

async function resolveUserId(
  data: JsonRecord,
  polarCustomerId: string | null,
) {
  const userId = metadataUserId(data) ?? externalCustomerIdFrom(data);
  if (userId) return userId;
  if (!polarCustomerId) return null;

  const { data: profile, error } = await adminClient()
    .from("billing_profiles")
    .select("user_id")
    .eq("polar_customer_id", polarCustomerId)
    .maybeSingle();

  if (error) throw error;
  return profile?.user_id ?? null;
}

async function handlePayload(payload: PolarPayload) {
  const eventType =
    typeof payload.type === "string" && payload.type.length > 0
      ? payload.type
      : "unknown";
  const data = asRecord(payload.data) ?? {};
  const eventId = eventIdFrom(payload, eventType, data);
  const isSubscriptionEvent = eventType.startsWith("subscription.");
  const polarCustomerId = polarCustomerIdFrom(data);
  const supabase = adminClient();

  const { data: existingEvent, error: existingEventError } = await supabase
    .from("billing_events")
    .select("polar_event_id")
    .eq("polar_event_id", eventId)
    .maybeSingle();

  if (existingEventError) throw existingEventError;
  if (existingEvent) return;

  const userId = await resolveUserId(data, polarCustomerId);

  if (!userId) {
    console.warn("Polar webhook could not resolve user", {
      eventType,
      polarCustomerId,
    });
    if (isSubscriptionEvent) {
      throw new Error("unresolved_polar_subscription_user");
    }
  } else {
    const now = new Date().toISOString();

    if (polarCustomerId) {
      const billingProfile: JsonRecord = {
        user_id: userId,
        polar_customer_id: polarCustomerId,
        updated_at: now,
      };
      const email = customerEmailFrom(data);
      if (email) billingProfile.email = email;

      const { error } = await supabase.from("billing_profiles").upsert(
        billingProfile,
        { onConflict: "user_id" },
      );
      if (error) throw error;
    }

    const status = subscriptionStatus(eventType, data);
    const subscriptionId = readString(data, [
      "subscription_id",
      "subscriptionId",
      "id",
    ]);
    const plan = planFromData(data);

    if (isSubscriptionEvent && (!status || !subscriptionId || !plan)) {
      console.warn("Polar subscription webhook payload incomplete", {
        eventType,
        eventId,
        hasStatus: Boolean(status),
        hasSubscriptionId: Boolean(subscriptionId),
        hasPlan: Boolean(plan),
      });
      throw new Error("incomplete_polar_subscription_payload");
    }

    if (isSubscriptionEvent) {
      const { error } = await supabase.from("account_subscriptions").upsert(
        {
          user_id: userId,
          plan,
          source: "polar",
          status,
          billing_cycle: cycleFromData(data),
          polar_subscription_id: subscriptionId,
          polar_product_id: productIdFrom(data),
          polar_price_id: priceIdFrom(data),
          polar_checkout_id: readString(data, ["checkout_id", "checkoutId"]),
          current_period_start: readIsoString(data, [
            "current_period_start",
            "currentPeriodStart",
            "started_at",
            "startedAt",
          ]),
          current_period_end: readIsoString(data, [
            "current_period_end",
            "currentPeriodEnd",
            "ends_at",
            "endsAt",
          ]),
          cancel_at_period_end:
            data.cancel_at_period_end === true ||
            data.cancelAtPeriodEnd === true,
          updated_at: now,
        },
        { onConflict: "polar_subscription_id" },
      );

      if (error) throw error;
    }
  }

  const { error: eventError } = await supabase.from("billing_events").insert({
    polar_event_id: eventId,
    event_type: eventType,
    payload,
  });

  if (eventError) {
    if (eventError.code === "23505") return;
    throw eventError;
  }
}

const polarWebhook = Webhooks({
  webhookSecret: Deno.env.get("POLAR_WEBHOOK_SECRET") ?? "",
  onPayload: handlePayload,
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, {
      "Allow": "POST, OPTIONS",
    });
  }

  try {
    const response = await polarWebhook(req);
    if (!response.ok) {
      return jsonResponse({ error: "Invalid webhook" }, 400);
    }

    return new Response(response.body, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (err) {
    console.error("polar-webhook error:", err);
    return jsonResponse({ error: "Invalid webhook" }, 400);
  }
});
