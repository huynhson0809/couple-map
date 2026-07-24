import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const subscriptionHook = readFileSync(resolve("src/hooks/useSubscription.tsx"), "utf8");
const pricingPage = readFileSync(resolve("src/pages/PricingPage.tsx"), "utf8");
const settingsPage = readFileSync(resolve("src/pages/SettingsPage.tsx"), "utf8");
const spacesHook = readFileSync(resolve("src/hooks/useSpaces.ts"), "utf8");
const managePlanStart = settingsPage.indexOf("async function handleManagePlan()");
const managePlanEnd = settingsPage.indexOf("const accountPlanName", managePlanStart);
assert.ok(
  managePlanStart >= 0 && managePlanEnd > managePlanStart,
  "Settings must define handleManagePlan before accountPlanName.",
);
const managePlanBlock = settingsPage.slice(managePlanStart, managePlanEnd);

assert.match(
  subscriptionHook,
  /accountPlan/i,
  "useSubscription must expose accountPlan.",
);
assert.match(
  subscriptionHook,
  /spacePlan/i,
  "useSubscription must expose spacePlan.",
);
assert.match(
  subscriptionHook,
  /ownedSpaceLimit/i,
  "useSubscription must expose ownedSpaceLimit.",
);
assert.match(
  subscriptionHook,
  /canCreateSpace/i,
  "useSubscription must expose canCreateSpace.",
);
assert.match(
  subscriptionHook,
  /create-polar-checkout/i,
  "useSubscription must call create-polar-checkout.",
);
assert.match(
  subscriptionHook,
  /create-customer-portal/i,
  "useSubscription must call create-customer-portal.",
);
assert.match(
  subscriptionHook,
  /get_subscription_context_for_space/i,
  "useSubscription must use the account-level subscription context RPC.",
);
assert.match(
  subscriptionHook,
  /loadOwnAccountSubscription[\s\S]*from\("account_subscriptions"\)[\s\S]*\.in\("status", \["active", "trialing"\]\)/,
  "The signed-in account plan must load independently from account_subscriptions.",
);
assert.doesNotMatch(
  subscriptionHook,
  /loadOwnAccountSubscription[\s\S]{0,900}\.eq\("source"/,
  "Account plan loading must accept Polar, activation-code, and manual subscriptions.",
);
assert.match(
  subscriptionHook,
  /billing=success|URLSearchParams\(window\.location\.search\)|billingReturn/i,
  "useSubscription must refresh after returning from Polar checkout.",
);
assert.match(
  subscriptionHook,
  /VITE_APP_URL|billingReturnAppUrl/i,
  "useSubscription must support a configured public billing return app URL for mobile browser flows.",
);
assert.match(
  subscriptionHook,
  /setTimeout[\s\S]*fetchPlan|fetchPlan[\s\S]*setTimeout/i,
  "Polar checkout return refresh must retry because webhooks can arrive after redirect.",
);

assert.match(
  pricingPage,
  /handleCheckout/i,
  "PricingPage must have a Polar checkout handler.",
);
assert.match(
  pricingPage,
  /Nâng cấp Plus|Upgrade Plus/i,
  "PricingPage must expose a Plus purchase CTA.",
);
assert.match(
  pricingPage,
  /Nâng cấp Pro|Upgrade Pro/i,
  "PricingPage must expose a Pro purchase CTA.",
);
assert.match(
  pricingPage,
  /Có mã kích hoạt|activation code/i,
  "Activation code UI must remain available as secondary UI.",
);
assert.doesNotMatch(
  pricingPage,
  /Zalo|pricing-contact-zalo|pricing-contact-buttons/i,
  "Activation code UI must not show Zalo/contact buttons.",
);

assert.match(
  settingsPage,
  /ownedSpaceLimit|canCreateSpace/i,
  "Settings must show account billing quota context.",
);
assert.match(
  settingsPage,
  /openCustomerPortal|customer portal|Quản lý gói/i,
  "Settings must open the Polar customer portal for plan management.",
);
assert.match(
  settingsPage,
  /subscriptionSource\s*===\s*"polar"/,
  "Settings must only open the Polar customer portal for Polar-managed subscriptions.",
);
assert.match(
  managePlanBlock,
  /subscriptionSource\s*!==\s*"polar"[\s\S]*setShowPricing\(true\)/,
  "Settings must route activation-code and manual plans to Polar checkout instead of customer portal.",
);
assert.match(
  settingsPage,
  /activation_code[\s\S]*(Kích hoạt bằng mã|Activated by code)/,
  "Settings must explain when the current plan came from an activation code.",
);
assert.match(
  settingsPage,
  /manual[\s\S]*(Cấp thủ công|Granted manually)/,
  "Settings must explain when the current plan was manually granted.",
);
assert.match(
  settingsPage,
  /Gia hạn qua Polar|Renew with Polar/,
  "Settings must offer a Polar renewal CTA for non-Polar paid plans.",
);
assert.match(
  settingsPage,
  /planActionBusy/,
  "Settings must track a local plan action busy state while billing portal APIs are pending.",
);
assert.match(
  settingsPage,
  /loading=\{accountPlanLoading \|\| planActionBusy\}/,
  "Settings plan action button must show loading feedback while opening billing flows.",
);
assert.match(
  settingsPage,
  /Đang mở|Opening/,
  "Settings plan action button must communicate that the portal is opening.",
);
assert.match(
  managePlanBlock,
  /finally\s*{[\s\S]*setPlanActionBusy\(false\)/,
  "Settings must clear the plan action busy state after launching or failing billing navigation.",
);

assert.match(
  spacesHook,
  /PBL01|canCreateSpace|quota/i,
  "Space creation UI path must handle billing quota errors.",
);
