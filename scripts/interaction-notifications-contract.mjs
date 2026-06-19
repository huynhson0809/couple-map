import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

const notificationsSql = readProjectFile("supabase/migration_notifications.sql");
const pinInteractionsSql = readProjectFile("supabase/migration_pin_interactions.sql");
const commentThreadsSql = readProjectFile("supabase/migration_comment_threads_reactions.sql");
const sendPush = readProjectFile("supabase/functions/send-push/index.ts");
const usePins = readProjectFile("src/hooks/usePins.ts");
const settingsPage = readProjectFile("src/pages/SettingsPage.tsx");

assert.match(
  notificationsSql,
  /function\s+public\.notification_preference_enabled/i,
  "notification triggers should share the same preference gate as push delivery",
);

for (const [kind, column] of [
  ["new memory", "memory_added"],
  ["reaction", "reactions"],
  ["comment", "comments"],
]) {
  assert.match(
    notificationsSql,
    new RegExp(`notification_preference_enabled\\([^)]*${column}`, "i"),
    `in-app ${kind} notifications should respect the ${column} setting`,
  );
}

assert.match(
  notificationsSql,
  /after\s+update\s+of\s+reaction\s+on\s+public\.pin_reactions/i,
  "pin reaction upserts that change emoji should create in-app notifications",
);
assert.match(
  notificationsSql,
  /after\s+update\s+of\s+reaction\s+on\s+public\.pin_comment_reactions/i,
  "comment reaction upserts that change emoji should create in-app notifications",
);
assert.match(
  notificationsSql,
  /function\s+public\.notify_pin_favorite/i,
  "favoriting a partner memory from detail should create an in-app notification",
);
assert.match(
  notificationsSql,
  /after\s+update\s+of\s+is_favorite\s+on\s+public\.pins/i,
  "favorite toggles should be observed by the notification trigger",
);

assert.match(
  pinInteractionsSql,
  /alter\s+table\s+public\.pin_reactions[\s\S]{0,160}add\s+column\s+if\s+not\s+exists\s+updated_at/i,
  "pin reactions need updated_at so push dedupe changes when a reaction is updated",
);
assert.match(
  commentThreadsSql,
  /alter\s+table\s+public\.pin_comment_reactions[\s\S]{0,160}add\s+column\s+if\s+not\s+exists\s+updated_at/i,
  "comment reactions need updated_at so push dedupe changes when a reaction is updated",
);
assert.match(
  sendPush,
  /updated_at/g,
  "send-push should include updated_at in reaction event keys",
);
assert.match(
  sendPush,
  /favorite/g,
  "send-push should support favorite detail-item interactions",
);
assert.match(
  usePins,
  /event_type:\s*['"]favorite['"]/,
  "favorite detail-item interactions should invoke push delivery after the update succeeds",
);

assert.doesNotMatch(
  settingsPage,
  /push\.subscribed\s*&&\s*\(\s*<>\s*<div className="notif-pref-row">[\s\S]{0,900}notif\.comments/,
  "interaction notification preference switches should not be hidden behind push subscription",
);
