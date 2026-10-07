import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PAID_PLANS_ENABLED } from "../src/config/paidPlans.ts";
import {
  PUBLIC_INFO_PAGE_KEYS,
  PUBLIC_PAGES,
  PUBLIC_PAGE_KEYS,
  getPublicPageRouteByPath,
} from "../src/content/publicPages.ts";

const read = (path) => readFileSync(resolve(path), "utf8");

assert.equal(
  PAID_PLANS_ENABLED,
  false,
  "Pinly currently runs as a free-only product.",
);

for (const keys of [PUBLIC_PAGE_KEYS, PUBLIC_INFO_PAGE_KEYS]) {
  assert.ok(
    !keys.includes("pricing"),
    "The pricing page must stay unpublished while paid plans are disabled.",
  );
}
for (const path of ["/pricing", "/vi/pricing"]) {
  assert.equal(
    getPublicPageRouteByPath(path),
    undefined,
    `${path} must not render a public page.`,
  );
}

const PAID_PLAN_COPY =
  /\b(?:Plus|Pro)\b|upgrade|pricing|nâng cấp|bảng giá|tùy theo gói|depending on the plan/i;
const PAID_FEATURE_COPY = /\bvideos?\b|\b3D\b/i;
for (const key of PUBLIC_PAGE_KEYS) {
  for (const language of ["en", "vi"]) {
    const copy = JSON.stringify(PUBLIC_PAGES[key][language]);
    assert.doesNotMatch(
      copy,
      PAID_PLAN_COPY,
      `Published ${key} (${language}) copy must not advertise paid plans.`,
    );
    // Careers mentions short-form video as a marketing channel, not a product feature.
    if (key === "careers") continue;
    assert.doesNotMatch(
      copy,
      PAID_FEATURE_COPY,
      `Published ${key} (${language}) copy must not promise video or 3D, which Free lacks.`,
    );
  }
}

assert.doesNotMatch(
  read("public/sitemap.xml"),
  /\/pricing</,
  "The sitemap must not list the hidden pricing page.",
);
for (const file of ["public/llms.txt", "public/llms-full.txt"]) {
  assert.doesNotMatch(
    read(file),
    /\/pricing|\$\d|\b(?:Plus|Pro)\b/,
    `${file} must not advertise pricing or paid plans.`,
  );
}

const vercel = JSON.parse(read("vercel.json"));
for (const [source, destination] of [
  ["/pricing", "/"],
  ["/vi/pricing", "/vi"],
]) {
  assert.ok(
    vercel.redirects?.some(
      (redirect) =>
        redirect.source === source &&
        redirect.destination === destination &&
        redirect.permanent === false,
    ),
    `${source} must temporarily redirect to ${destination}.`,
  );
  assert.ok(
    !vercel.rewrites.some((rewrite) => rewrite.source === source),
    `${source} must not rewrite to a prerendered page that is no longer built.`,
  );
}

assert.match(
  read("src/components/public/PublicSiteChrome.tsx"),
  /PUBLIC_PAGE_KEYS\.includes\("pricing"\) && \(/,
  "The public nav must hide the pricing link with the page.",
);

assert.doesNotMatch(
  read("src/hooks/useSubscription.tsx"),
  /PAID_PLANS_ENABLED/,
  "Existing paid plans and Pro-space members must keep their entitlements while upgrades are hidden.",
);

const settings = read("src/pages/SettingsPage.tsx");
assert.match(
  settings,
  /showPlanSection =\s*PAID_PLANS_ENABLED \|\| accountPlan !== "free" \|\| spacePlan !== "free"/,
  "Settings must keep the plan card only for existing paid plans or Pro spaces.",
);
assert.match(
  settings,
  /showPlanAction = PAID_PLANS_ENABLED \|\| planManagedByPolar/,
  "Settings must only offer Polar subscription management, not upgrades or renewals.",
);
assert.match(
  settings,
  /\{showPlanSection && \(\s*<SettingSection[\s\S]{0,160}className="setting-section-plan"[\s\S]*?\{showPlanAction && \(/,
  "The plan card must hide its upgrade action for non-Polar plans.",
);
assert.match(
  settings,
  /visibleStyles = PAID_PLANS_ENABLED\s*\?\s*sortedStyles\s*:\s*sortedStyles\.filter\(\(style\) => canUseMapStyle\(style\.id\)\)/,
  "Settings must list only the map styles the current plan includes.",
);
assert.match(
  settings,
  /\{\(PAID_PLANS_ENABLED \|\| canUseMap3D\) && \(/,
  "Settings must not offer a 3D map upgrade.",
);

assert.match(
  read("src/pages/MapPage.tsx"),
  /if \(PAID_PLANS_ENABLED\) \{\s*setShowUpgradePrompt\(true\);\s*return;\s*\}[\s\S]{0,200}pin\.mapMemoryLimitReached/,
  "Reaching the memory limit must explain the limit instead of offering an upgrade.",
);

for (const path of [
  "src/components/pins/CreatePinForm.tsx",
  "src/components/pins/EditPinForm.tsx",
]) {
  const form = read(path);
  assert.match(
    form,
    /\{\(PAID_PLANS_ENABLED \|\| canUploadVideo\) && \(/,
    `${path} must hide video uploads that the Free plan does not include.`,
  );
  assert.match(
    form,
    /canAddCustomCategory =\s*PAID_PLANS_ENABLED \|\| canCreateCategory\(customCategories\.length\)/,
    `${path} must hide custom categories that the Free plan does not include.`,
  );
}

const replay = read("src/pages/YearReplayPage.tsx");
assert.match(
  replay,
  /replayEditorAvailable = PAID_PLANS_ENABLED \|\| canCustomizeReplay/,
  "Replay must not show locked paid customization.",
);
assert.match(
  replay,
  /REPLAY_TEMPLATES\.filter\(\s*\(template\) =>\s*PAID_PLANS_ENABLED \|\| canUseReplayTemplate\(template\.id\)/,
  "Replay must hide templates the current plan does not include.",
);
assert.match(
  replay,
  /\{\(PAID_PLANS_ENABLED \|\| canUseAdvancedReplayStyling\) && \(/,
  "Replay must hide the Pro-only styling upsell.",
);

assert.equal(
  read("src/hooks/I18nContext.tsx").split('"pin.mapMemoryLimitReached"')
    .length - 1,
  2,
  "The no-upgrade memory limit message must exist in both languages.",
);

console.log("free mode contract: ok");
