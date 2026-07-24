import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const subscriptionProvider = readFileSync(
  resolve("src/hooks/useSubscription.tsx"),
  "utf8",
);
const appShell = readFileSync(resolve("src/App.tsx"), "utf8");
const settingsPage = readFileSync(resolve("src/pages/SettingsPage.tsx"), "utf8");
const mapStyleHook = readFileSync(resolve("src/hooks/useMapStyle.ts"), "utf8");

assert.equal(
  packageJson.scripts["check:settings-space-switch-flicker"],
  "node scripts/settings-space-switch-flicker-contract.mjs",
  "package.json should expose the Settings space-switch flicker contract.",
);

assert.match(
  appShell,
  /if \(loading\) return <AppStatusScreen title=\{t\("app\.loading"\)\} \/>;/,
  "RoutedShell still uses space loading for the full app loading screen.",
);

assert.match(
  subscriptionProvider,
  /hasLoadedPlanOnceRef/,
  "SubscriptionProvider should track whether a plan has loaded once.",
);
assert.match(
  readFileSync(resolve("src/hooks/PinsContext.tsx"), "utf8"),
  /const writable = !subscriptionLoading && currentSpaceWritable/,
  "Pin mutations must wait for the active space's subscription context.",
);

assert.match(
  settingsPage,
  /anniversaryDraft\.spaceId === currentSpaceId/,
  "Anniversary form state must be scoped to the active space.",
);

assert.match(
  mapStyleHook,
  /const styleId = sanitizeMapStyleId\(requestedStyleId, canUseMapStyle\)/,
  "Map style availability should be derived when plan access changes.",
);
assert.doesNotMatch(
  mapStyleHook,
  /if \(stored[\s\S]{0,300}setStyleIdState\(/,
  "Map style hooks must not schedule state updates while rendering.",
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

assert.match(
  subscriptionProvider,
  /activeSpaceContextResolved[\s\S]*resolvedUserId === userId[\s\S]*resolvedSpaceId === spaceId/,
  "Space entitlements must be associated with the account and space that produced them.",
);
assert.match(
  subscriptionProvider,
  /loadOwnAccountSubscription[\s\S]*from\("account_subscriptions"\)[\s\S]*resolvedAccountUserId/,
  "Account plan loading must not depend on the active space RPC.",
);
assert.match(
  settingsPage,
  /accountLoading: accountPlanLoading[\s\S]*const accountPlanName = accountPlanLoading/,
  "The Settings plan card must use the independent account loading state.",
);
assert.match(
  appShell,
  /<SubscriptionProvider spaceId=\{scopedId\} userId=\{scopedUserId\}>/,
  "SubscriptionProvider must receive the authenticated account scope.",
);
assert.match(
  subscriptionProvider,
  /activeUserIdRef\.current !== targetUserId/,
  "Late subscription responses from a previous account must be ignored.",
);
assert.match(
  subscriptionProvider,
  /activeSpaceWritable =\s*activeSpaceContextResolved && effectiveContext\.currentSpaceWritable/,
  "Writes must stay disabled while the next space's entitlement context is unresolved.",
);
