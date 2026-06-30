import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { requireAuthUser } from "../_shared/auth-user.ts";
import { resolveTrustedAppUrl } from "../_shared/app-url.ts";
import { corsHeaders, jsonResponse } from "../_shared/billing-cors.ts";
import { polarJson } from "../_shared/polar-client.ts";

type CustomerSessionResponse = {
  id: string;
  customer_portal_url: string;
};

type CustomerPortalBody = {
  app_url?: unknown;
};

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
    const body = await req.json().catch(() => ({} as CustomerPortalBody));
    const appUrl = resolveTrustedAppUrl(body.app_url);

    if (!appUrl) {
      return jsonResponse({ error: "Unable to open customer portal" }, 500);
    }

    const session = await polarJson<CustomerSessionResponse>(
      "/v1/customer-sessions/",
      {
        method: "POST",
        body: JSON.stringify({
          external_customer_id: user.id,
          return_url: `${appUrl}/?billing=portal-return`,
        }),
      },
    );

    return jsonResponse({
      url: session.customer_portal_url,
      customer_session_id: session.id,
    });
  } catch (err) {
    console.error("create-customer-portal error:", err);
    if (isAuthError(err)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    return jsonResponse({ error: "Unable to open customer portal" }, 500);
  }
});
