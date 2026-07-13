import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

const settingsPage = readProjectFile("src/pages/SettingsPage.tsx");
const supportCenter = readProjectFile("src/components/settings/SupportCenter.tsx");
const migration = readProjectFile("supabase/migration_support_tickets.sql");
const translations = readProjectFile("src/hooks/I18nContext.tsx");

assert.match(
  settingsPage,
  /SupportCenter/,
  "SettingsPage should open the support center.",
);
assert.match(
  settingsPage,
  /settings\.supportFaq[\s\S]*settings\.supportContact[\s\S]*settings\.supportReportBug/,
  "SettingsPage should expose FAQ, admin contact, and bug report actions.",
);
assert.match(
  supportCenter,
  /from\("support_tickets"\)/,
  "SupportCenter should save and load support tickets from Supabase.",
);
assert.match(
  supportCenter,
  /navigator\.userAgent[\s\S]*window\.innerWidth[\s\S]*window\.innerHeight/,
  "Bug reports should include useful client diagnostics.",
);
assert.match(
  supportCenter,
  /role="dialog"[\s\S]*aria-modal="true"/,
  "SupportCenter should render as an accessible modal.",
);
assert.match(
  supportCenter,
  /createPortal/,
  "SupportCenter should use a portal so Settings cards cannot cover it.",
);

assert.match(
  migration,
  /create table if not exists public\.support_tickets/,
  "Support tickets migration should create the ticket table.",
);
assert.match(
  migration,
  /enable row level security/,
  "Support tickets must use row-level security.",
);
assert.match(
  migration,
  /user_id = auth\.uid\(\)/,
  "Users should only be able to access their own support tickets.",
);
assert.match(
  migration,
  /enforce_support_ticket_rate_limit/,
  "Support ticket creation should be rate-limited.",
);
assert.doesNotMatch(
  migration,
  /for update|for delete/i,
  "Clients should not be able to edit or delete submitted support tickets.",
);

for (const key of [
  "settings.supportTitle",
  "settings.supportFaq",
  "settings.supportContact",
  "settings.supportReportBug",
  "support.submitSuccess",
]) {
  const occurrences = translations.match(new RegExp(`"${key}"`, "g")) ?? [];
  assert.equal(
    occurrences.length,
    2,
    `${key} should exist in both English and Vietnamese dictionaries.`,
  );
}

console.log("support center contract: ok");
