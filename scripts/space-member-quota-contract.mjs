import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const billingSql = readFileSync(resolve("supabase/migration_polar_billing.sql"), "utf8");
const spacesSql = readFileSync(resolve("supabase/migration_memory_spaces.sql"), "utf8");
const switcher = readFileSync(resolve("src/components/settings/SpaceSwitcher.tsx"), "utf8");
const settings = readFileSync(resolve("src/pages/SettingsPage.tsx"), "utf8");
const i18n = readFileSync(resolve("src/hooks/I18nContext.tsx"), "utf8");
const css = readFileSync(resolve("src/index.css"), "utf8");

function functionBody(sql, name) {
  const pattern = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`,
    "i",
  );
  const match = sql.match(pattern);
  assert.ok(match, `Missing function ${name}`);
  return match[1];
}

assert.equal(
  packageJson.scripts["check:space-member-quota"],
  "node scripts/space-member-quota-contract.mjs",
  "package.json should expose the member quota contract.",
);

const ownedCountBody = functionBody(billingSql, "get_owned_space_count");
assert.match(
  ownedCountBody,
  /from public\.spaces s[\s\S]*where s\.owner_id = p_user_id/i,
  "Owned space quota must count only spaces owned by the user.",
);
assert.doesNotMatch(
  ownedCountBody,
  /space_members/i,
  "Owned space quota must not count joined spaces from space_members.",
);

const joinBody = functionBody(spacesSql, "join_space_by_invite");
assert.match(
  joinBody,
  /insert into public\.space_members/i,
  "Joining by invite should add membership to the target space.",
);
assert.doesNotMatch(
  joinBody,
  /can_create_owned_space|get_owned_space_limit|get_owned_space_count|space_quota/i,
  "Joining by invite must not enforce owned-space creation quota.",
);

assert.match(
  settings,
  /Maps created: \$\{ownedSpaceCount\}\/\$\{ownedSpaceLimit\}/,
  "Settings plan card should label quota as maps created in English.",
);
assert.match(
  settings,
  /Bản đồ đã tạo: \$\{ownedSpaceCount\}\/\$\{ownedSpaceLimit\}/,
  "Settings plan card should label quota as maps created in Vietnamese.",
);

assert.match(
  switcher,
  /joinSpaceByInvite/,
  "SpaceSwitcher should expose a join-by-invite flow for users who already have a space.",
);
assert.match(
  switcher,
  /handleJoinSpaceByInvite/,
  "SpaceSwitcher should submit invite codes through a dedicated handler.",
);

const createSpaceHandler = switcher.match(
  /async function handleCreateSpace\(\) \{[\s\S]*?\n  \}/,
)?.[0];
assert.ok(createSpaceHandler, "SpaceSwitcher should keep a create-space handler.");
assert.match(
  createSpaceHandler,
  /quotaReached/,
  "Space creation should remain gated by quota.",
);

const joinSpaceHandler = switcher.match(
  /async function handleJoinSpaceByInvite\([\s\S]*?\n  \}/,
)?.[0];
assert.ok(joinSpaceHandler, "SpaceSwitcher should keep a join-by-invite handler.");
assert.doesNotMatch(
  joinSpaceHandler,
  /quotaReached/,
  "Join-by-invite should not be disabled by creation quota.",
);

for (const key of [
  "settings.joinSpace",
  "settings.joinSpaceHint",
  "settings.joinSpaceSuccess",
  "settings.spaceQuotaCreateOnly",
]) {
  assert.match(i18n, new RegExp(`"${key}"`), `Missing i18n key ${key}.`);
}
assert.match(i18n, /Bạn vẫn có thể tham gia bản đồ được mời/);
assert.match(i18n, /You can still join maps you are invited to/);

assert.match(css, /\.space-join-form/);
assert.match(css, /\.space-join-input/);
