import { adminClient, requireAuthUser } from "./auth-user.ts";
import { corsHeaders, jsonResponse } from "./billing-cors.ts";

type ActivateBody = {
  code?: unknown;
};

type ActivateCodeResult = {
  success?: unknown;
  status?: unknown;
  error?: unknown;
  plan?: unknown;
  expires_at?: unknown;
  message?: unknown;
};

function isAuthError(err: unknown) {
  if (!(err instanceof Error)) return false;
  return err.message === "missing_auth_header" || err.message === "auth_failed";
}

function normalizeCode(value: unknown) {
  if (typeof value !== "string") return null;

  const code = value.trim().toUpperCase();
  if (!code) return null;
  if (code.length > 64) return "too_long";

  return code;
}

function asResult(value: unknown): ActivateCodeResult | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ActivateCodeResult)
    : null;
}

function statusFrom(value: unknown) {
  return typeof value === "number" && value >= 400 && value <= 599
    ? value
    : 500;
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function handleActivateCodeRequest(
  req: Request,
  logLabel: string,
) {
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
    const supabaseAdmin = adminClient();

    const { data: allowed, error: rateError } = await supabaseAdmin.rpc(
      "check_edge_rate_limit",
      {
        limit_key: `activate-code:${user.id}`,
        window_seconds: 3600,
        max_requests: 20,
      },
    );

    if (rateError) return jsonResponse({ error: "Rate limit unavailable" }, 500);
    if (allowed === false) return jsonResponse({ error: "Too many attempts" }, 429);

    const body = await req.json().catch(() => ({} as ActivateBody));
    const normalizedCode = normalizeCode(body.code);

    if (!normalizedCode) {
      return jsonResponse({ error: "Code is required" }, 400);
    }

    if (normalizedCode === "too_long") {
      return jsonResponse({ error: "Code is too long" }, 400);
    }

    const { data, error } = await supabaseAdmin.rpc("activate_account_code", {
      p_user_id: user.id,
      p_code: normalizedCode,
      p_user_email: user.email?.toLowerCase() ?? null,
    });

    if (error) throw error;

    const result = asResult(data);
    if (!result) {
      console.error(`${logLabel} invalid RPC result`);
      return jsonResponse({ error: "Internal server error" }, 500);
    }

    if (result.success !== true) {
      return jsonResponse(
        { error: stringFrom(result.error) ?? "Internal server error" },
        statusFrom(result.status),
      );
    }

    const plan = stringFrom(result.plan);
    const expiresAt = stringFrom(result.expires_at);
    const message = stringFrom(result.message);

    if (!plan || !expiresAt || !message) {
      console.error(`${logLabel} incomplete RPC success result`);
      return jsonResponse({ error: "Internal server error" }, 500);
    }

    return jsonResponse({
      success: true,
      plan,
      expires_at: expiresAt,
      message,
    });
  } catch (err) {
    console.error(`${logLabel} error:`, err);
    if (isAuthError(err)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    return jsonResponse({ error: "Internal server error" }, 500);
  }
}
