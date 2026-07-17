import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { adminClient, requireAuthUser } from "../_shared/auth-user.ts";
import {
  buildCorsHeaders,
  handleCorsPreflightIfNeeded,
} from "../_shared/cors.ts";

type SupportRequestBody = {
  action?: unknown;
  ticket_id?: unknown;
  kind?: unknown;
  subject?: unknown;
  message?: unknown;
  context?: unknown;
};

type TicketRow = {
  id: string;
  user_id: string;
  kind: "question" | "bug";
  subject: string;
  status: string;
};

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function userClient(token: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayName(metadata: Record<string, unknown> | undefined) {
  const candidates = [metadata?.display_name, metadata?.full_name, metadata?.name];
  return candidates.find(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  )?.trim() ?? "Pinly user";
}

async function sendAdminEmail(input: {
  ticket: TicketRow;
  message: string;
  isReply: boolean;
  userEmail?: string;
  userName: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from =
    Deno.env.get("SUPPORT_EMAIL_FROM") ??
    Deno.env.get("STREAK_REMINDER_EMAIL_FROM");
  const recipients = (Deno.env.get("SUPPORT_ADMIN_EMAIL") ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (!apiKey || !from || recipients.length === 0) {
    console.error("Support admin email is not configured");
    return { sent: false, reason: "missing_email_config" };
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "https://pinly.tech").replace(
    /\/$/,
    "",
  );
  const ticketUrl = `${appUrl}/admin/support?ticket=${input.ticket.id}`;
  const requestType = input.ticket.kind === "bug" ? "Bug" : "Question";
  const subject = input.isReply
    ? `[Pinly Support] User replied: ${input.ticket.subject}`
    : `[Pinly Support] New ${requestType}: ${input.ticket.subject}`;
  const account = input.userEmail
    ? `${input.userName} (${input.userEmail})`
    : input.userName;
  const text = [
    input.isReply ? "A user replied to a support ticket." : "A new support ticket was created.",
    "",
    `Ticket: #${input.ticket.id.slice(0, 8).toUpperCase()}`,
    `From: ${account}`,
    `Subject: ${input.ticket.subject}`,
    "",
    input.message,
    "",
    `Open ticket: ${ticketUrl}`,
  ].join("\n");
  const html = [
    `<p>${input.isReply ? "A user replied to a support ticket." : "A new support ticket was created."}</p>`,
    `<p><strong>Ticket:</strong> #${input.ticket.id.slice(0, 8).toUpperCase()}<br>`,
    `<strong>From:</strong> ${escapeHtml(account)}<br>`,
    `<strong>Subject:</strong> ${escapeHtml(input.ticket.subject)}</p>`,
    `<div style="white-space:pre-wrap;padding:16px;background:#f5f6f8;border-radius:8px">${escapeHtml(input.message)}</div>`,
    `<p><a href="${ticketUrl}">Open this ticket in Pinly Admin</a></p>`,
  ].join("");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "Pinly/1.0",
      },
      body: JSON.stringify({ from, to: recipients, subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error("Resend support email error", {
        status: response.status,
        body: await response.text(),
      });
      return { sent: false, reason: `resend_${response.status}` };
    }
    return { sent: true, reason: null };
  } catch (error) {
    console.error("Resend support email request failed", error);
    return { sent: false, reason: "resend_request_failed" };
  }
}

function errorStatus(message: string) {
  if (message.includes("rate_limit") || message.includes("daily_limit")) return 429;
  if (message.includes("closed")) return 409;
  if (
    message.includes("required") ||
    message.includes("too_long") ||
    message.includes("violates check constraint")
  ) {
    return 400;
  }
  if (
    message.includes("not_authenticated") ||
    message.includes("missing_auth_header") ||
    message.includes("auth_failed")
  ) {
    return 401;
  }
  if (message.includes("not_found")) return 404;
  return 500;
}

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const { token, user } = await requireAuthUser(req);
    const body = (await req.json().catch(() => ({}))) as SupportRequestBody;
    const action = body.action === "reply" ? "reply" : "create";
    const message = cleanString(body.message);
    if (message.length < (action === "create" ? 20 : 1) || message.length > 4000) {
      return jsonResponse(req, { error: "Invalid support message" }, 400);
    }

    const client = userClient(token);
    let ticket: TicketRow;

    if (action === "create") {
      const kind = body.kind === "bug" ? "bug" : "question";
      const subject = cleanString(body.subject);
      const context =
        body.context && typeof body.context === "object" && !Array.isArray(body.context)
          ? body.context
          : {};
      if (subject.length < 3 || subject.length > 120) {
        return jsonResponse(req, { error: "Invalid support subject" }, 400);
      }

      const { data, error } = await client
        .from("support_tickets")
        .insert({
          user_id: user.id,
          kind,
          subject,
          message,
          context,
        })
        .select("id, user_id, kind, subject, status")
        .single();
      if (error) throw error;
      ticket = data as TicketRow;
    } else {
      const ticketId = cleanString(body.ticket_id);
      if (!ticketId) {
        return jsonResponse(req, { error: "Ticket is required" }, 400);
      }
      const { error } = await client.rpc("add_support_ticket_user_message", {
        p_ticket_id: ticketId,
        p_body: message,
      });
      if (error) throw error;

      const { data, error: ticketError } = await adminClient()
        .from("support_tickets")
        .select("id, user_id, kind, subject, status")
        .eq("id", ticketId)
        .eq("user_id", user.id)
        .single();
      if (ticketError) throw ticketError;
      ticket = data as TicketRow;
    }

    const email = await sendAdminEmail({
      ticket,
      message,
      isReply: action === "reply",
      userEmail: user.email,
      userName: displayName(user.user_metadata),
    });

    return jsonResponse(
      req,
      {
        ticket_id: ticket.id,
        status: ticket.status,
        email_sent: email.sent,
      },
      action === "create" ? 201 : 200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("submit-support-message error", error);
    return jsonResponse(req, { error: message }, errorStatus(message));
  }
});
