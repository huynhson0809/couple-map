import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(path), "utf8");
}

const migration = read("supabase/migration_support_conversations.sql");
const supportFunction = read(
  "supabase/functions/submit-support-message/index.ts",
);
const supportCenter = read("src/components/settings/SupportCenter.tsx");
const adminPage = read("src/pages/AdminSupportPage.tsx");
const translations = read("src/hooks/I18nContext.tsx");

assert.match(
  migration,
  /create table if not exists public\.support_ticket_messages/,
  "Support conversations should store each message as a separate row.",
);
assert.match(
  migration,
  /Users can read own support messages[\s\S]*st\.user_id = auth\.uid\(\)/,
  "Users must only read messages from their own tickets.",
);
assert.match(
  migration,
  /insert into public\.support_ticket_messages[\s\S]*select st\.id, 'user'/,
  "Existing ticket messages should be backfilled.",
);
assert.match(
  migration,
  /create or replace function public\.add_support_ticket_user_message/,
  "Users should reply through a protected database function.",
);
assert.match(
  migration,
  /v_ticket\.status = 'closed'[\s\S]*support_ticket_closed/,
  "Closed tickets should reject new user replies.",
);
assert.match(
  migration,
  /admin_update_support_ticket[\s\S]*insert into public\.support_ticket_messages[\s\S]*'admin'/,
  "Admin replies should append to the conversation instead of replacing history.",
);
assert.match(
  migration,
  /alter publication supabase_realtime[\s\S]*support_ticket_messages/,
  "Conversation messages should be available through realtime.",
);

for (const secret of [
  "RESEND_API_KEY",
  "SUPPORT_ADMIN_EMAIL",
  "SUPPORT_EMAIL_FROM",
]) {
  assert.match(
    supportFunction,
    new RegExp(secret),
    `The support Edge Function should read ${secret}.`,
  );
}
assert.match(
  supportFunction,
  /api\.resend\.com\/emails/,
  "User messages should notify admins through Resend.",
);
assert.match(
  supportFunction,
  /\/admin\/support\?ticket=/,
  "Admin emails should deep-link to the affected ticket.",
);

assert.match(
  supportCenter,
  /from\("support_ticket_messages"\)/,
  "The user support center should load full conversation history.",
);
assert.match(
  supportCenter,
  /functions\.invoke\([\s\S]*"submit-support-message"[\s\S]*action: "reply"/,
  "Users should create and reply through the support Edge Function.",
);
assert.match(
  supportCenter,
  /support-conversation-message from-/,
  "The support center should visibly distinguish conversation participants.",
);

assert.match(
  adminPage,
  /from\("support_ticket_messages"\)/,
  "The admin dashboard should load the message thread.",
);
assert.match(
  adminPage,
  /admin-support-thread-message from-/,
  "The admin dashboard should render a bidirectional conversation.",
);
assert.match(
  adminPage,
  /p_admin_reply: reply \|\| null/,
  "The admin composer should send only the new reply.",
);

for (const key of [
  "support.conversation",
  "support.replyPlaceholder",
  "support.replySend",
  "support.ticketClosed",
]) {
  const occurrences = translations.match(new RegExp(`"${key}"`, "g")) ?? [];
  assert.equal(
    occurrences.length,
    2,
    `${key} should exist in both English and Vietnamese dictionaries.`,
  );
}

console.log("support conversations contract: ok");
