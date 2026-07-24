import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eligibleDuoRecipients } from "../supabase/functions/_shared/streak-reminder-recipients.ts";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

const reminderFunction = readProjectFile(
  "supabase/functions/send-streak-reminders/index.ts",
);
const settingsPage = readProjectFile("src/pages/SettingsPage.tsx");
const pricingPage = readProjectFile("src/pages/PricingPage.tsx");
const publicPages = readProjectFile("src/content/publicPages.ts");
const migration = readProjectFile(
  "supabase/migration_pro_streak_email_reminders.sql",
);

assert.match(
  settingsPage,
  /canUseEmailStreakReminders\s*=\s*!accountPlanLoading\s*&&\s*accountPlan\s*===\s*"pro"/,
  "Settings must only expose streak email reminders after an active Pro plan loads.",
);
assert.match(
  settingsPage,
  /\{canUseEmailStreakReminders\s*&&\s*\([\s\S]*notif\.streakEmailReminders/,
  "The streak email preference row must be hidden from Free and Plus accounts.",
);
assert.match(
  settingsPage,
  /accountPlan === "pro"[\s\S]*Includes email streak reminders/,
  "The current Pro plan summary must advertise email streak reminders.",
);
assert.match(
  pricingPage,
  /plus:[\s\S]*emailReminders", value: false[\s\S]*pro:[\s\S]*emailReminders", value: true/,
  "The upgrade comparison must show email reminders as a Pro-only benefit.",
);
assert.match(
  pricingPage,
  /Nhắc chuỗi qua email[\s\S]*Email streak reminders/,
  "The Pro benefit must have English and Vietnamese labels.",
);
assert.match(
  publicPages,
  /Nhắc chuỗi qua email[\s\S]*Email streak reminders/,
  "The public pricing page must advertise the localized Pro benefit.",
);

assert.match(
  reminderFunction,
  /sendEmailToUser[\s\S]*get_account_plan[\s\S]*accountPlan !== "pro"[\s\S]*email_requires_pro/,
  "Email delivery must verify the recipient still has Pro access.",
);
assert.deepEqual(
  eligibleDuoRecipients(
    { today_user_a_posted: false, today_user_b_posted: false },
    "user-a",
    "user-b",
  ),
  [
    { userId: "user-a", slot: "user_a" },
    { userId: "user-b", slot: "user_b" },
  ],
  "Both members should be reminded when neither has posted.",
);
assert.deepEqual(
  eligibleDuoRecipients(
    { today_user_a_posted: true, today_user_b_posted: false },
    "user-a",
    "user-b",
  ),
  [{ userId: "user-b", slot: "user_b" }],
  "Only the missing partner should be reminded after user A posts.",
);
assert.deepEqual(
  eligibleDuoRecipients(
    { today_user_a_posted: false, today_user_b_posted: true },
    "user-a",
    "user-b",
  ),
  [{ userId: "user-a", slot: "user_a" }],
  "Only the missing partner should be reminded after user B posts.",
);
assert.deepEqual(
  eligibleDuoRecipients(
    { today_user_a_posted: true, today_user_b_posted: true },
    "user-a",
    "user-b",
  ),
  [],
  "No member should be reminded after both have posted.",
);
assert.match(
  reminderFunction,
  /refresh_couple_streak[\s\S]*latestStreakRow[\s\S]*eligibleDuoRecipients\([\s\S]*if \(recipients\.length === 0\)/,
  "Duo delivery must refresh streak state immediately before choosing recipients.",
);
assert.match(
  reminderFunction,
  /for \(const recipient of recipients\)[\s\S]*sendToUser\([\s\S]*sendScheduledEmailToUser\(/,
  "Push and email must share the same filtered recipient list.",
);

assert.match(
  migration,
  /create trigger enforce_pro_streak_email_reminders[\s\S]*before insert or update of streak_email_reminders/,
  "The database must enforce Pro-only email preferences.",
);
assert.match(
  migration,
  /update public\.notification_preferences[\s\S]*get_account_plan\(p\.user_id\) <> 'pro'/,
  "Existing non-Pro email preferences must be disabled.",
);

console.log("pro streak email reminders contract: ok");
