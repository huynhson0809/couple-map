import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  migration,
  subscription,
  switcher,
  notificationHook,
  notificationsPage,
  uploadSigner,
  mediaDelete,
] = await Promise.all([
  readFile("supabase/migration_space_downgrade_access.sql", "utf8"),
  readFile("src/hooks/useSubscription.tsx", "utf8"),
  readFile("src/components/settings/SpaceSwitcher.tsx", "utf8"),
  readFile("src/hooks/useNotificationFeed.ts", "utf8"),
  readFile("src/pages/NotificationsPage.tsx", "utf8"),
  readFile("supabase/functions/sign-cloudinary-upload/index.ts", "utf8"),
  readFile("supabase/functions/delete-pin-media/index.ts", "utf8"),
]);

assert.match(
  migration,
  /create table if not exists public\.account_space_quota_states/i,
  "downgrades need durable account quota state",
);
assert.match(
  migration,
  /v_now \+ interval '7 days'/i,
  "over-limit owners need a seven-day grace period",
);
assert.match(
  migration,
  /set_owned_space_quota_selection/i,
  "owners need an RPC for selecting editable maps",
);
assert.match(
  migration,
  /Space selection is locked after the grace period/i,
  "selection must stop rotating after grace",
);
assert.match(
  migration,
  /tg_table_name = 'spaces' and tg_op = 'DELETE'/i,
  "deleting an extra owned map must remain possible",
);
assert.match(
  migration,
  /using errcode = 'PSQ01'/i,
  "read-only writes need a stable database error code",
);

for (const table of [
  "pins",
  "pin_images",
  "bucket_list",
  "custom_categories",
  "pin_reactions",
  "pin_comments",
  "pin_comment_reactions",
]) {
  assert.match(
    migration,
    new RegExp(`'${table}'`),
    `${table} writes must be covered by the quota guard`,
  );
}

assert.match(
  migration,
  /'space_quota', v_quota_context/i,
  "subscription context must return account quota state",
);
assert.match(
  migration,
  /'current_space_writable', v_current_space_writable/i,
  "subscription context must return active-space write access",
);
assert.match(
  migration,
  /mapped_space\.name as space_name/i,
  "the global inbox must label notifications with their space",
);
assert.doesNotMatch(
  migration,
  /n\.space_id = ts\.id/i,
  "the latest notification feed must not be scoped to one active space",
);

assert.match(
  subscription,
  /spaceQuotaGraceEndsAt/,
  "frontend subscription state must expose the grace deadline",
);
assert.match(
  subscription,
  /set_owned_space_quota_selection/,
  "frontend must persist the owner's selected maps",
);
assert.match(
  subscription,
  /currentSpaceWritable && currentCount < limits\.pins/,
  "read-only maps must block memory creation in the UI",
);
assert.match(
  switcher,
  /spaceQuotaGraceTitle/,
  "settings must explain the grace-period choice",
);
assert.match(
  switcher,
  /spaceReadOnly/,
  "settings must label restricted maps",
);

assert.doesNotMatch(
  notificationHook,
  /notificationBelongsToActiveSpace/,
  "realtime notifications must not disappear outside the active space",
);
assert.doesNotMatch(
  notificationHook,
  /type\.eq\.support_reply,space_id\.eq/,
  "mark-all must apply to the account-wide inbox",
);
assert.match(
  notificationsPage,
  /await setActiveSpace\(targetSpace\.id\)/,
  "opening a notification from another map must switch space first",
);
assert.match(
  notificationsPage,
  /notif\.inSpace/,
  "notification rows must show their source space",
);

for (const edgeFunction of [uploadSigner, mediaDelete]) {
  assert.match(
    edgeFunction,
    /is_space_writable/,
    "Cloudinary mutations must verify space write access",
  );
  assert.match(
    edgeFunction,
    /Space is read-only/,
    "Cloudinary mutations need an explicit read-only response",
  );
}

console.log("Space downgrade and global inbox contracts passed.");
