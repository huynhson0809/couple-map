import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

const sendNudge = readProjectFile("supabase/functions/send-nudge/index.ts");
const useNudge = readProjectFile("src/hooks/useNudge.ts");
const streakCard = readProjectFile("src/components/streak/StreakCard.tsx");
const notificationFeed = readProjectFile("src/hooks/NotificationFeedContext.tsx");
const settingsPage = readProjectFile("src/pages/SettingsPage.tsx");

assert.match(
  streakCard,
  /onNudge\s*&&\s*!todayCompleted\s*&&\s*youPosted\s*&&\s*!partnerPosted/,
  "manual nudge button should only show when you posted and partner has not posted",
);

assert.match(
  sendNudge,
  /refresh_couple_streak/,
  "send-nudge should refresh streak state before deciding whether partner still needs a nudge",
);
assert.match(
  useNudge,
  /body:\s*\{\s*coupleId\s*\}/,
  "useNudge should pass the active space/couple id to send-nudge.",
);
assert.match(
  useNudge,
  /function\s+cooldownKey[\s\S]*coupleId/,
  "useNudge should scope local nudge cooldown by active space/couple id.",
);
assert.match(
  sendNudge,
  /loadDuoSpaceForNudge/,
  "send-nudge should resolve the nudge target through active memory-space membership.",
);
assert.match(
  sendNudge,
  /space_members[\s\S]*space_id[\s\S]*status[\s\S]*members\.length !== 2/,
  "send-nudge should require exactly two active space members before sending.",
);
assert.match(
  sendNudge,
  /active_space_id/,
  "send-nudge should require the requested duo space to be the sender's active space.",
);
assert.doesNotMatch(
  sendNudge,
  /\.or\(`user_a\.eq\.\$\{user\.id\},user_b\.eq\.\$\{user\.id\}`\)/,
  "send-nudge must not auto-pick a legacy couple by user membership when multiple spaces can exist.",
);
assert.match(
  sendNudge,
  /today_user_a_posted[\s\S]*today_user_b_posted/,
  "send-nudge should inspect both users' current-day posting state",
);
assert.match(
  sendNudge,
  /partner_already_posted/,
  "send-nudge should skip delivery if the partner has already posted today",
);
assert.match(
  sendNudge,
  /sender_not_posted/,
  "send-nudge should skip delivery if the sender has not posted today",
);

assert.match(
  sendNudge,
  /async\s+function\s+insertNudgeNotification/,
  "send-nudge should have a dedicated in-app notification insert path",
);
assert.match(
  sendNudge,
  /\.from\("notifications"\)\s*[\s\S]*\.insert\(\{/,
  "send-nudge should insert an in-app streak_reminder notification",
);
assert.match(
  sendNudge,
  /type:\s*"streak_reminder"[\s\S]*source:\s*"nudge"/,
  "manual nudge in-app notification should be identifiable as a streak_reminder nudge",
);

const inAppInsertIndex = sendNudge.indexOf("insertNudgeNotification(");
const noPushReturnIndex = sendNudge.indexOf('reason: "no_push_subscriptions"');
assert.ok(
  inAppInsertIndex >= 0 && noPushReturnIndex >= 0 && inAppInsertIndex < noPushReturnIndex,
  "send-nudge must create the in-app notification before returning from the no-push-subscriptions path",
);

assert.match(
  sendNudge,
  /inAppSent:\s*true[\s\S]*reason:\s*"no_push_subscriptions"/,
  "no push subscription should still report in-app delivery instead of a total send failure",
);

assert.match(
  notificationFeed,
  /TOAST_TYPES\s*=\s*new Set\(\[[^\]]*"streak_reminder"/,
  "in-app streak reminder notifications should surface as realtime toasts",
);
assert.match(
  settingsPage,
  /checked=\{notifPrefs\.prefs\.streak_reminders\}/,
  "streak reminders should remain controlled by the notification setting",
);
