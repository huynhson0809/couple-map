import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

const migration = readProjectFile(
  "supabase/migration_international_streak_timezone.sql",
);
const preferenceSync = readProjectFile(
  "src/hooks/useAccountPreferencesSync.ts",
);
const i18nContext = readProjectFile("src/hooks/I18nContext.tsx");
const secureSignup = readProjectFile("supabase/functions/secure-signup/index.ts");

assert.match(
  migration,
  /add column if not exists timezone_confirmed boolean not null default false/,
  "Legacy timezone backfills must be distinguishable from observed device timezones.",
);
assert.match(
  migration,
  /add column if not exists streak_timezone text/,
  "Each shared or solo space needs one stable timezone for streak-day boundaries.",
);
assert.match(
  migration,
  /create or replace function public\.resolve_couple_streak_timezone/,
);
assert.match(
  migration,
  /couple_row\.streak_timezone[\s\S]*u\.timezone_confirmed = true[\s\S]*legacy_timezone[\s\S]*return 'UTC'/,
  "Resolution should prefer a locked space zone, then a confirmed device zone, then safe fallbacks.",
);
assert.match(
  migration,
  /not copied to couples\.streak_timezone until a device confirms its zone/,
  "A legacy Vietnam fallback must not become a permanent international setting.",
);
assert.doesNotMatch(
  migration.replace(/^\s*--.*$/gm, ""),
  /Asia\/Ho_Chi_Minh/,
  "The authoritative streak migration must not hardcode Vietnam time.",
);
assert.match(
  migration,
  /streak_tz := public\.resolve_couple_streak_timezone\(target_couple_id\)/,
);
assert.match(
  migration,
  /\(p\.created_at at time zone streak_tz\)::date/,
  "Historical pins and today's status must be bucketed in the same stable zone.",
);
assert.match(
  migration,
  /get_space_effective_plan\(couple_row\.space_id\)/,
  "International timezone support must preserve plan-aware streak grace.",
);
assert.match(
  migration,
  /best_count = greatest\(public\.couple_streaks\.best_count, excluded\.best_count\)/,
  "International timezone support must preserve the historical best streak.",
);
assert.match(
  migration,
  /Do not charge grace while today is still open/,
  "Timezone migration must retain open-day grace behavior.",
);

assert.match(
  preferenceSync,
  /select\("locale, timezone, timezone_confirmed"\)/,
);
assert.match(preferenceSync, /const timezone = detectUserTimeZone\(\)/);
assert.match(
  preferenceSync,
  /const nextLocale = isSupportedLocale\(preferences\.locale\)[\s\S]*setLangFromAccount\(nextLocale\)/,
  "An authenticated account's saved locale should override a previous browser user's preference.",
);
assert.doesNotMatch(
  preferenceSync,
  /!hasLocalPreference && isSupportedLocale/,
  "A shared browser preference must not overwrite another account's saved locale.",
);
assert.match(
  i18nContext,
  /setLangFromAccount: \(l: Lang\) => void/,
  "I18n should support applying an account locale without marking it as a manual device choice.",
);
assert.match(
  preferenceSync,
  /preferences\.timezone !== timezone \|\|[\s\S]*!preferences\.timezone_confirmed/,
  "A legacy but syntactically valid timezone must still be replaced by the observed device zone.",
);
assert.match(
  preferenceSync,
  /timezone_confirmed: true/,
  "Successful profile sync must mark the timezone as observed.",
);
assert.match(
  secureSignup,
  /timezone: normalizeTimeZone\(timezone\)/,
  "New email accounts must continue sending device timezone metadata at signup.",
);

console.log("international streak timezone contract: ok");
