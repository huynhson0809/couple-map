/**
 * Shared CORS utility for Edge Functions.
 * Restricts Access-Control-Allow-Origin to known trusted origins
 * instead of using a wildcard "*".
 *
 * Configure allowed origins via env var:
 *   CORS_ALLOWED_ORIGINS=https://pinly.tech,https://www.pinly.tech
 */

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "";
  const origins = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Fallback if env var is not set
  if (origins.length === 0) {
    const appUrl = Deno.env.get("APP_URL");
    return appUrl ? [appUrl] : [];
  }

  return origins;
}

function isLocalDev(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    );
  } catch {
    return false;
  }
}

/**
 * Returns the validated origin if it's in the allow-list,
 * or null if the origin is not trusted.
 */
export function getValidOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return null;

  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) return origin;

  // Allow localhost in non-production for development
  if (Deno.env.get("ENVIRONMENT") !== "production" && isLocalDev(origin)) {
    return origin;
  }

  return null;
}

/**
 * Build CORS headers with the validated origin.
 * Falls back to the primary production origin if no valid origin is found
 * (e.g., server-to-server calls without Origin header).
 */
export function buildCorsHeaders(
  req: Request,
  extraHeaders?: string,
): Record<string, string> {
  const allowed = getAllowedOrigins();
  const fallback = allowed[0] ?? "";
  const origin = getValidOrigin(req) ?? fallback;
  const allowHeaders = extraHeaders
    ? `authorization, x-client-info, apikey, content-type, ${extraHeaders}`
    : "authorization, x-client-info, apikey, content-type";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

/**
 * Handle OPTIONS preflight request.
 */
export function handleCorsPreflightIfNeeded(
  req: Request,
  extraHeaders?: string,
): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: buildCorsHeaders(req, extraHeaders),
    });
  }
  return null;
}
