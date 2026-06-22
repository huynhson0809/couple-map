import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const migrationPath = "supabase/migration_couple_breakup.sql";
const edgePath = "supabase/functions/breakup-couple/index.ts";

assert.ok(
  existsSync(resolve(root, migrationPath)),
  "breakup migration should exist",
);
assert.ok(
  existsSync(resolve(root, edgePath)),
  "breakup Edge Function should exist",
);

const migration = read(migrationPath);
const edge = read(edgePath);
const useCouple = read("src/hooks/useCouple.ts");
const settings = read("src/pages/SettingsPage.tsx");
const setup = read("src/components/auth/CoupleSetup.tsx");
const i18n = read("src/hooks/I18nContext.tsx");

assert.match(
  migration,
  /create table if not exists public\.couple_lifecycle_notices/,
  "migration should create user-scoped lifecycle notices",
);
assert.match(
  migration,
  /create or replace function public\.finalize_couple_breakup/,
  "migration should create the finalization RPC",
);
assert.match(
  migration,
  /couple_locked_at\s*=\s*null/,
  "finalization should clear the one-couple lock timestamp",
);
assert.match(
  migration,
  /first_couple_id\s*=\s*null/,
  "finalization should clear the first couple lock",
);
assert.match(
  migration,
  /set_config\(['"]pinly\.allow_membership_mutation['"],\s*['"]on['"],\s*true\)/,
  "finalization should opt in to protected membership-field mutation",
);
assert.match(
  migration,
  /used_by_couple_id\s*=\s*null/,
  "finalization should detach old activation-code FK references",
);
assert.match(
  migration,
  /expires_at\s*=\s*least\(coalesce\(expires_at,\s*now\(\)\),\s*now\(\)\)/,
  "detached activation codes should be expired so they cannot be reused",
);
assert.match(
  migration,
  /delete from public\.couples/,
  "finalization should delete the old couple after resetting users",
);

assert.match(edge, /function\s+getBearerToken/, "Edge Function should require bearer auth");
assert.match(edge, /check_edge_rate_limit/, "Edge Function should rate limit breakup attempts");
assert.match(
  edge,
  /deleteCloudinaryResourcesByPrefix/,
  "Edge Function should delete Cloudinary resources by couple prefix",
);
assert.match(edge, /pinly\/\$\{coupleId\}/, "Cloudinary cleanup should use the couple folder");
assert.match(edge, /resourceType:\s*"image"/, "Cloudinary cleanup should include images");
assert.match(edge, /resourceType:\s*"video"/, "Cloudinary cleanup should include videos");
assert.match(edge, /finalize_couple_breakup/, "Edge Function should call the DB finalization RPC");
assert.ok(
  edge.indexOf("deleteCloudinaryResourcesByPrefix") <
    edge.indexOf("finalize_couple_breakup"),
  "media cleanup should be defined before DB finalization usage",
);

assert.match(useCouple, /breakupCouple/, "useCouple should expose breakupCouple");
assert.match(
  useCouple,
  /supabase\.functions\.invoke\(["']breakup-couple["']/,
  "useCouple should call the Edge Function",
);
assert.doesNotMatch(
  useCouple,
  /\.from\(["']couples["']\)\s*\.delete/,
  "client should not delete couples directly",
);
assert.doesNotMatch(
  useCouple,
  /\.from\(["']users["']\)\s*\.update\([^)]*couple_id/,
  "client should not update protected membership fields directly",
);

assert.match(settings, /KET THUC/, "Settings confirmation should require typed KET THUC");
assert.match(settings, /breakupCouple/, "Settings should call breakupCouple");
assert.match(settings, /settings\.breakup/, "Settings should use breakup i18n keys");
assert.match(
  setup,
  /fetchUnreadCoupleLifecycleNotice/,
  "CoupleSetup should fetch unread lifecycle notices",
);
assert.match(
  setup,
  /markCoupleLifecycleNoticeRead/,
  "CoupleSetup should mark lifecycle notices as read",
);
assert.match(i18n, /settings\.breakupTitle/, "i18n should include breakup settings copy");
assert.match(i18n, /pair\.coupleEndedNotice/, "i18n should include setup notice copy");

console.log("Couple breakup contract passed.");
