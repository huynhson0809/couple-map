import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  localDayBounds,
  localReminderParts,
  normalizeReminderLocale,
  normalizeReminderTimeZone,
  recipientReminderWindow,
} from "../supabase/functions/_shared/reminder-local-time.ts";
import { eligibleDuoRecipients } from "../supabase/functions/_shared/streak-reminder-recipients.ts";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

const reminderFunction = readProjectFile(
  "supabase/functions/send-streak-reminders/index.ts",
);
const migration = readProjectFile(
  "supabase/migration_user_locale_timezone_reminders.sql",
);
const cron = readProjectFile("supabase/script_streak_reminder_cron.sql");

assert.deepEqual(
  localReminderParts(new Date("2026-07-22T13:00:00.000Z"), "Asia/Ho_Chi_Minh"),
  { date: "2026-07-22", hour: 20 },
  "Vietnam recipients should be evaluated at their local hour.",
);
assert.deepEqual(
  localReminderParts(new Date("2026-07-22T13:00:00.000Z"), "America/New_York"),
  { date: "2026-07-22", hour: 9 },
  "US recipients must not inherit the Vietnam reminder hour.",
);

const vietnamWindow = recipientReminderWindow({
  now: new Date("2026-07-22T13:00:00.000Z"),
  timeZone: "Asia/Ho_Chi_Minh",
  force: false,
  forcedDate: "",
  forcedHour: -1,
  reminderHours: [12, 20, 22, 23],
});
const newYorkWindow = recipientReminderWindow({
  now: new Date("2026-07-22T13:00:00.000Z"),
  timeZone: "America/New_York",
  force: false,
  forcedDate: "",
  forcedHour: -1,
  reminderHours: [12, 20, 22, 23],
});
assert.equal(vietnamWindow.shouldSend, true);
assert.equal(newYorkWindow.shouldSend, false);

assert.deepEqual(
  localDayBounds("2026-03-08", "America/New_York"),
  {
    start: "2026-03-08T05:00:00.000Z",
    end: "2026-03-09T04:00:00.000Z",
  },
  "Local day bounds must handle the 23-hour daylight-saving transition.",
);
assert.equal(normalizeReminderTimeZone("Not/A_Timezone"), "UTC");
assert.equal(normalizeReminderLocale("fr"), "en");

assert.deepEqual(
  eligibleDuoRecipients(
    { today_user_a_posted: true, today_user_b_posted: false },
    "already-posted-user",
    "missing-user",
  ),
  [{ userId: "missing-user", slot: "user_b" }],
  "A member who already posted must not receive push or email reminders.",
);

assert.doesNotMatch(
  reminderFunction,
  /Asia\/Ho_Chi_Minh/,
  "The Edge Function must not use a fixed Vietnam timezone.",
);
assert.match(
  reminderFunction,
  /for \(const recipient of recipients\)[\s\S]*loadUserDeliveryProfile[\s\S]*recipientReminderWindow/,
  "Each duo recipient must receive an independent local delivery window.",
);
assert.match(
  reminderFunction,
  /claimReminderWindow\([\s\S]*recipient\.userId/,
  "Duplicate protection must be claimed per recipient.",
);
assert.match(
  reminderFunction,
  /EN_REMINDER_TEMPLATES[\s\S]*reminderTitle\(profile\.locale\)/,
  "International accounts must receive localized push and email copy.",
);

assert.match(migration, /add column if not exists locale text/);
assert.match(migration, /add column if not exists timezone text/);
assert.match(migration, /recipient_user_id uuid/);
assert.match(migration, /idx_streak_reminder_logs_recipient_window/);
assert.match(migration, /get_solo_streak_reminder_targets_v2/);
assert.match(migration, /pg_timezone_names/);

assert.match(
  cron,
  /'0 \* \* \* \*'/,
  "The cron must run hourly so all recipient timezones can reach their windows.",
);
assert.doesNotMatch(
  cron,
  /jsonb_build_object\(\s*'date'/,
  "The production cron must not force a Vietnam-local date or hour.",
);

console.log("international reminders contract: ok");
