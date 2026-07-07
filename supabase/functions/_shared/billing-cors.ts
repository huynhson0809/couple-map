import { buildCorsHeaders } from "./cors.ts";

export function getCorsHeaders(req: Request) {
  return buildCorsHeaders(req, "polar-webhook-signature");
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
