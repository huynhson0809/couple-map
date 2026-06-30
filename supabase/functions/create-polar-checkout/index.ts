import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { adminClient, requireAuthUser } from "../_shared/auth-user.ts";
import { corsHeaders, jsonResponse } from "../_shared/billing-cors.ts";
import { polarJson, productIdFor } from "../_shared/polar-client.ts";

type CheckoutResponse = {
  id: string;
  url: string;
};

type CheckoutBody = {
  plan?: unknown;
  cycle?: unknown;
};

function normalizePlan(value: unknown): "plus" | "pro" | null {
  return value === "plus" || value === "pro" ? value : null;
}

function normalizeCycle(value: unknown): "monthly" | "annual" | null {
  return value === "monthly" || value === "annual" ? value : null;
}

function appUrlFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isAuthError(err: unknown) {
  if (!(err instanceof Error)) return false;
  return err.message === "missing_auth_header" || err.message === "auth_failed";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, {
      "Allow": "POST, OPTIONS",
    });
  }

  try {
    const { user } = await requireAuthUser(req);
    const body = await req.json().catch(() => ({} as CheckoutBody));
    const plan = normalizePlan(body.plan);
    const cycle = normalizeCycle(body.cycle);

    if (!plan || !cycle) {
      return jsonResponse({ error: "Invalid plan or billing cycle" }, 400);
    }

    const appUrl = appUrlFrom(Deno.env.get("APP_URL"));
    if (!appUrl) {
      return jsonResponse({ error: "Unable to create checkout" }, 500);
    }

    const productId = productIdFor(plan, cycle);
    const customerEmail =
      typeof user.email === "string" ? user.email.toLowerCase() : undefined;
    const successUrl = `${appUrl}/?billing=success&plan=${plan}`;
    const returnUrl = `${appUrl}/?billing=return`;

    const checkout = await polarJson<CheckoutResponse>("/v1/checkouts/", {
      method: "POST",
      body: JSON.stringify({
        products: [productId],
        external_customer_id: user.id,
        customer_email: customerEmail,
        success_url: successUrl,
        return_url: returnUrl,
        metadata: {
          user_id: user.id,
          plan,
          cycle,
          source: "pinly",
        },
      }),
    });

    const { error } = await adminClient().from("billing_profiles").upsert(
      {
        user_id: user.id,
        email: customerEmail ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) throw error;

    return jsonResponse({ url: checkout.url, checkout_id: checkout.id });
  } catch (err) {
    console.error("create-polar-checkout error:", err);
    if (isAuthError(err)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    return jsonResponse({ error: "Unable to create checkout" }, 500);
  }
});
