import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { adminClient, requireAuthUser } from "../_shared/auth-user.ts";
import { resolveTrustedAppUrl } from "../_shared/app-url.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/billing-cors.ts";
import {
  currencyForCheckoutLocale,
  resolveCheckoutLocale,
  resolveCustomerIp,
} from "../_shared/checkout-context.ts";
import { polarJson, productIdFor } from "../_shared/polar-client.ts";

type CheckoutResponse = {
  id: string;
  url: string;
};

type CheckoutBody = {
  plan?: unknown;
  cycle?: unknown;
  locale?: unknown;
  app_url?: unknown;
};

function normalizePlan(value: unknown): "plus" | "pro" | null {
  return value === "plus" || value === "pro" ? value : null;
}

function normalizeCycle(value: unknown): "monthly" | "annual" | null {
  return value === "monthly" || value === "annual" ? value : null;
}

function isAuthError(err: unknown) {
  if (!(err instanceof Error)) return false;
  return err.message === "missing_auth_header" || err.message === "auth_failed";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405, {
      Allow: "POST, OPTIONS",
    });
  }

  try {
    const { user } = await requireAuthUser(req);
    const body = await req.json().catch(() => ({}) as CheckoutBody);
    const plan = normalizePlan(body.plan);
    const cycle = normalizeCycle(body.cycle);
    const locale = resolveCheckoutLocale(
      body.locale,
      req.headers.get("accept-language"),
    );

    if (!plan || !cycle) {
      return jsonResponse(req, { error: "Invalid plan or billing cycle" }, 400);
    }

    const appUrl = resolveTrustedAppUrl(body.app_url);
    if (!appUrl) {
      return jsonResponse(req, { error: "Unable to create checkout" }, 500);
    }

    const productId = productIdFor(plan, cycle);
    const customerEmail =
      typeof user.email === "string" ? user.email.toLowerCase() : undefined;
    const successUrl = `${appUrl}/?billing=success&plan=${plan}`;
    const returnUrl = `${appUrl}/?billing=return`;
    const customerIp = resolveCustomerIp(req.headers);

    const checkout = await polarJson<CheckoutResponse>("/v1/checkouts/", {
      method: "POST",
      body: JSON.stringify({
        products: [productId],
        external_customer_id: user.id,
        customer_email: customerEmail,
        customer_ip_address: customerIp ?? undefined,
        locale,
        currency: currencyForCheckoutLocale(locale),
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

    const { error } = await adminClient()
      .from("billing_profiles")
      .upsert(
        {
          user_id: user.id,
          email: customerEmail ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (error) throw error;

    return jsonResponse(req, { url: checkout.url, checkout_id: checkout.id });
  } catch (err) {
    console.error("create-polar-checkout error:", err);
    if (isAuthError(err)) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }

    return jsonResponse(req, { error: "Unable to create checkout" }, 500);
  }
});
