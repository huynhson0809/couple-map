import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const subscriptionHook = readFileSync(
  resolve("src/hooks/useSubscription.tsx"),
  "utf8",
);
const pricingPage = readFileSync(resolve("src/pages/PricingPage.tsx"), "utf8");
const pricingCatalog = readFileSync(
  resolve("src/lib/pricingCatalog.ts"),
  "utf8",
);
const billingMigration = readFileSync(
  resolve("supabase/migration_polar_billing.sql"),
  "utf8",
);
const rolloutMigration = readFileSync(
  resolve("supabase/migration_plan_memory_limits.sql"),
  "utf8",
);

for (const [plan, expected] of [
  ["free", 50],
  ["plus", 300],
  ["pro", 500],
]) {
  assert.match(
    subscriptionHook,
    new RegExp(`${plan}:\\s*\\{\\s*pins:\\s*${expected}\\b`),
    `${plan} frontend memory limit must be ${expected}.`,
  );
}

for (const pattern of [
  /String\(PLAN_LIMITS\.free\.pins\)/,
  /String\(PLAN_LIMITS\.plus\.pins\)/,
  /String\(PLAN_LIMITS\.pro\.pins\)/,
]) {
  assert.match(pricingPage, pattern, `Missing pricing contract: ${pattern}`);
}

for (const pattern of [
  /monthly:\s*\{\s*plus:\s*59_000,\s*pro:\s*99_000\s*\}/,
  /annual:\s*\{\s*plus:\s*566_000,\s*pro:\s*950_000\s*\}/,
]) {
  assert.match(
    pricingCatalog,
    pattern,
    `Missing localized pricing contract: ${pattern}`,
  );
}

for (const sql of [billingMigration, rolloutMigration]) {
  assert.match(
    sql,
    /when 'pro' then jsonb_build_object\(\s*'pins', 500/i,
    "Database Pro memory limit must be 500.",
  );
  assert.match(
    sql,
    /when 'plus' then jsonb_build_object\(\s*'pins', 300/i,
    "Database Plus memory limit must be 300.",
  );
  assert.match(
    sql,
    /else jsonb_build_object\(\s*'pins', 50/i,
    "Database Free memory limit must be 50.",
  );
  assert.match(
    sql,
    /get_plan_limits\(v_space_plan\)\s*->>\s*'pins'/i,
    "Pin enforcement must derive its quota from get_plan_limits.",
  );
}

console.log("Plan pricing and memory limit contract passed.");
