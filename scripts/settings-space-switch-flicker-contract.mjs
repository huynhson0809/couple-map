import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const subscriptionProvider = readFileSync(
  resolve("src/hooks/useSubscription.tsx"),
  "utf8",
);
const appShell = readFileSync(resolve("src/App.tsx"), "utf8");

assert.equal(
  packageJson.scripts["check:settings-space-switch-flicker"],
  "node scripts/settings-space-switch-flicker-contract.mjs",
  "package.json should expose the Settings space-switch flicker contract.",
);

assert.match(
  appShell,
  /if \(loading\) return <AppStatusScreen title="Loading Pinly…" \/>;/,
  "RoutedShell still uses space loading for the full app loading screen.",
);

assert.match(
  subscriptionProvider,
  /hasLoadedPlanOnceRef/,
  "SubscriptionProvider should track whether a plan has loaded once.",
);

assert.match(
  subscriptionProvider,
  /if \(!hasLoadedPlanOnceRef\.current\) setLoading\(true\);/,
  "Plan refetches after the first load should keep the current Settings UI mounted.",
);

assert.match(
  subscriptionProvider,
  /hasLoadedPlanOnceRef\.current = true;[\s\S]*setLoading\(false\);/,
  "SubscriptionProvider should mark the initial plan load complete before clearing loading.",
);
