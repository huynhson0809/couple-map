import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

const migration = readProjectFile(
  "supabase/migration_solo_streak_reminders.sql",
);
const reminderFunction = readProjectFile(
  "supabase/functions/send-streak-reminders/index.ts",
);
const settingsPage = readProjectFile("src/pages/SettingsPage.tsx");

assert.match(
  migration,
  /create or replace function public\.get_solo_streak_reminder_targets/,
  "Solo reminder migration must expose a dedicated service-role target query.",
);
assert.match(
  migration,
  /s\.id = u\.active_space_id/,
  "Solo reminders must follow the user's active space instead of every owned space.",
);
assert.match(
  migration,
  /public\.is_space_writable\(s\.id\)/,
  "Solo reminders must skip active spaces that became read-only after a plan downgrade.",
);
assert.match(
  migration,
  /count\(\*\)[\s\S]*active_members\.status = 'active'[\s\S]*\) = 1/,
  "Solo reminders must only target spaces with exactly one active member.",
);
assert.match(
  migration,
  /not exists \([\s\S]*from public\.pins[\s\S]*Asia\/Ho_Chi_Minh/,
  "Solo targets must exclude spaces that already saved a memory today in VN time.",
);
assert.match(
  migration,
  /grant execute on function public\.get_solo_streak_reminder_targets\(date\)[\s\S]*to service_role/,
  "Solo target discovery must stay private to the reminder Edge Function.",
);

assert.match(
  reminderFunction,
  /REMINDER_HOURS = \[12, 20, 22, 23\]/,
  "Solo reminders must share the established daily reminder windows.",
);
assert.match(
  reminderFunction,
  /DEFAULT_GEMINI_MODEL = "gemini-3\.5-flash"/,
  "Streak reminder copy must default to Google's current stable Flash model.",
);
assert.match(
  reminderFunction,
  /LEGACY_GEMINI_MODELS[\s\S]*gemini-2\.5-flash[\s\S]*DEFAULT_GEMINI_MODEL/,
  "A stale Gemini 2.5 model secret must fall forward to the current default.",
);
assert.match(
  reminderFunction,
  /thinkingConfig: \{ thinkingLevel: "minimal" \}/,
  "Gemini 3 reminder generation must use the supported low-latency thinking level.",
);
assert.match(
  reminderFunction,
  /get_solo_streak_reminder_targets/,
  "The reminder function must load solo targets from the database contract.",
);
assert.match(
  reminderFunction,
  /claimReminderWindow[\s\S]*streak_reminder_logs/,
  "Solo and duo reminders must share the same per-space hourly deduplication log.",
);
assert.match(
  reminderFunction,
  /latestPin[\s\S]*created_at[\s\S]*already_posted/,
  "The reminder function must recheck today's pins immediately before solo delivery.",
);
assert.match(
  reminderFunction,
  /recipientSlot === "solo"[\s\S]*solo_missing/,
  "Solo reminders must use copy that does not mention a partner.",
);
assert.match(
  reminderFunction,
  /mode: "solo"[\s\S]*url: "\/"/,
  "Solo push notifications must open the active map where a memory can be added.",
);
assert.match(
  reminderFunction,
  /sendToUser\(supabase, target\.user_id, payload\)/,
  "Solo push delivery must honor the existing streak reminder preference.",
);

assert.match(
  settingsPage,
  /duoFeaturesEnabled && \([\s\S]*notif\.comments[\s\S]*<\/>\s*\)\}[\s\S]*notif\.streakReminders/,
  "Streak reminder preferences must remain visible outside the duo-only interaction controls.",
);

console.log("solo streak reminders contract: ok");
