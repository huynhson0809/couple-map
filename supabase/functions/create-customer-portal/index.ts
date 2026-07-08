import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { adminClient, requireAuthUser } from "../_shared/auth-user.ts";
import { resolveTrustedAppUrl } from "../_shared/app-url.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/billing-cors.ts";
import {
  getPolarServer,
  PolarApiError,
  polarJson,
} from "../_shared/polar-client.ts";

type CustomerSessionResponse = {
  id: string;
  customer_portal_url: string;
};

type CustomerPortalBody = {
  app_url?: unknown;
};

type BillingProfile = {
  polar_customer_id: string | null;
};

type CustomerSessionBody =
  | {
      customer_id: string;
      return_url: string;
    }
  | {
      external_customer_id: string;
      return_url: string;
    };

function isAuthError(err: unknown) {
  if (!(err instanceof Error)) return false;
  return err.message === "missing_auth_header" || err.message === "auth_failed";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(source: Record<string, unknown> | null, keys: string[]) {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function customerMissingFromPolar(err: unknown) {
  if (!(err instanceof PolarApiError) || err.status !== 422) return false;

  const body = asRecord(err.body);
  const detail = Array.isArray(body?.detail) ? body.detail : [];

  return detail.some((entry) => {
    const record = asRecord(entry);
    const message = readString(record, ["msg", "message"]);
    return message?.toLowerCase().includes("customer does not exist") ?? false;
  });
}

function customerItemsFrom(response: unknown) {
  const root = asRecord(response);
  const result = asRecord(root?.Result) ?? root;
  const items = Array.isArray(result?.items) ? result.items : [];

  return items
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function matchingCustomerId(response: unknown, email: string) {
  const normalizedEmail = email.toLowerCase();

  for (const customer of customerItemsFrom(response)) {
    const customerEmail = readString(customer, ["email"]);
    const deletedAt = readString(customer, ["deleted_at", "deletedAt"]);
    const customerId = readString(customer, ["id"]);

    if (
      customerId &&
      !deletedAt &&
      customerEmail?.toLowerCase() === normalizedEmail
    ) {
      return customerId;
    }
  }

  return null;
}

async function createCustomerSession(body: CustomerSessionBody) {
  return await polarJson<CustomerSessionResponse>("/v1/customer-sessions/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function findCustomerIdByEmail(email: string) {
  const response = await polarJson<unknown>(
    `/v1/customers/?email=${encodeURIComponent(email)}&limit=10`,
    {
      method: "GET",
    },
  );

  return matchingCustomerId(response, email);
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
    const body = await req.json().catch(() => ({}) as CustomerPortalBody);
    const appUrl = resolveTrustedAppUrl(body.app_url);
    const customerEmail =
      typeof user.email === "string" ? user.email.toLowerCase() : null;

    if (!appUrl) {
      return jsonResponse(
        req,
        { error: "Unable to open customer portal" },
        500,
      );
    }

    const supabase = adminClient();
    const { data: profileRow, error: profileError } = await supabase
      .from("billing_profiles")
      .select("polar_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const billingProfile = profileRow as BillingProfile | null;
    const returnUrl = `${appUrl}/?billing=portal-return`;
    const customerSessionBody = billingProfile?.polar_customer_id
      ? {
          customer_id: billingProfile.polar_customer_id,
          return_url: returnUrl,
        }
      : {
          external_customer_id: user.id,
          return_url: returnUrl,
        };

    let session: CustomerSessionResponse;

    try {
      session = await createCustomerSession(customerSessionBody);
    } catch (err) {
      if (!customerEmail || !customerMissingFromPolar(err)) throw err;

      console.warn("Polar customer session target was missing; recovering", {
        polarServer: getPolarServer(),
        hadStoredCustomerId: Boolean(billingProfile?.polar_customer_id),
      });

      const recoveredCustomerId = await findCustomerIdByEmail(customerEmail);

      if (
        !recoveredCustomerId ||
        recoveredCustomerId === billingProfile?.polar_customer_id
      ) {
        throw err;
      }

      const { error: recoveryError } = await supabase
        .from("billing_profiles")
        .upsert(
          {
            user_id: user.id,
            email: customerEmail,
            polar_customer_id: recoveredCustomerId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

      if (recoveryError) throw recoveryError;

      session = await createCustomerSession({
        customer_id: recoveredCustomerId,
        return_url: returnUrl,
      });
    }

    return jsonResponse(req, {
      url: session.customer_portal_url,
      customer_session_id: session.id,
    });
  } catch (err) {
    console.error("create-customer-portal error:", err);
    if (isAuthError(err)) {
      return jsonResponse(req, { error: "Unauthorized" }, 401);
    }

    return jsonResponse(req, { error: "Unable to open customer portal" }, 500);
  }
});
