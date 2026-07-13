import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migration = readFileSync(
  resolve(root, "supabase/migration_streak_best_monotonic.sql"),
  "utf8",
);
const legacyMigration = readFileSync(
  resolve(root, "supabase/migration_streak_plan_grace.sql"),
  "utf8",
);
const recovery = readFileSync(
  resolve(
    root,
    "supabase/script_restore_best_streak_47_taikhoanluutrucuason.sql",
  ),
  "utf8",
);

assert.match(
  migration,
  /create trigger couple_streaks_preserve_best_count/i,
  "Database must enforce a monotonic best streak for every write path.",
);
assert.match(
  migration,
  /greatest\(\s*coalesce\(old\.best_count, 0\),\s*coalesce\(new\.best_count, 0\),\s*new\.current_count\s*\)/i,
  "The invariant trigger must preserve the old record and cover current_count.",
);
assert.match(
  migration,
  /get_space_effective_plan\(couple_row\.space_id\)/i,
  "Streak grace must use the space owner's account plan.",
);
assert.match(
  migration,
  /Do not charge grace while today is still open/i,
  "Open-day refreshes must not consume grace.",
);
assert.match(
  migration,
  /best_count = greatest\(public\.couple_streaks\.best_count, excluded\.best_count\)/i,
  "The refresh upsert must never lower best_count.",
);
assert.doesNotMatch(
  legacyMigration,
  /final_best := greatest\(longest_run, final_current\);/i,
  "The legacy migration must not overwrite the historical best streak.",
);
assert.match(
  recovery,
  /target_best constant int := 47/i,
  "The targeted recovery must restore the confirmed 47-day record.",
);
assert.match(
  recovery,
  /cardinality\(target_couple_ids\) > 1/i,
  "The recovery script must refuse to guess between multiple shared spaces.",
);

console.log("Streak integrity contract passed.");
