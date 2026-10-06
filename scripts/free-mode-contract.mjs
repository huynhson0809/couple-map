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
for (const key of PUBLIC_PAGE_KEYS) {
  for (const language of ["en", "vi"]) {
    assert.doesNotMatch(
      JSON.stringify(PUBLIC_PAGES[key][language]),
      PAID_PLAN_COPY,
      `Published ${key} (${language}) copy must not advertise paid plans.`,
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

assert.match(
  read("src/hooks/useSubscription.tsx"),
  /const effectiveContext = PAID_PLANS_ENABLED\s*\?\s*resolvedContext\s*:\s*\{[\s\S]*?plan: "free"[\s\S]*?accountPlan: "free"[\s\S]*?spacePlan: "free"[\s\S]*?subscription: null,\s*canUseMap3D: false,/,
  "Every account must receive Free plan entitlements while paid plans are disabled.",
);

const settings = read("src/pages/SettingsPage.tsx");
assert.match(
  settings,
  /\{PAID_PLANS_ENABLED && \(\s*<SettingSection[\s\S]{0,160}className="setting-section-plan"/,
  "Settings must hide the plan and upgrade card.",
);
assert.match(
  settings,
  /visibleStyles = PAID_PLANS_ENABLED\s*\?\s*sortedStyles\s*:\s*sortedStyles\.filter\(\(style\) => canUseMapStyle\(style\.id\)\)/,
  "Settings must list only map styles included in the Free plan.",
);
assert.match(
  settings,
  /\{\(PAID_PLANS_ENABLED \|\| canUseMap3D\) && \(/,
  "Settings must not offer a 3D map upgrade.",
);

assert.match(
  read("src/pages/MapPage.tsx"),
  /if \(PAID_PLANS_ENABLED\) \{\s*setShowUpgradePrompt\(true\);\s*return;\s*\}[\s\S]{0,200}pin\.freeMemoryLimitReached/,
  "Reaching the memory limit must explain the Free limit instead of offering an upgrade.",
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

assert.match(
  read("src/pages/YearReplayPage.tsx"),
  /replayEditorAvailable = PAID_PLANS_ENABLED \|\| canCustomizeReplay/,
  "Replay must not show locked paid customization.",
);

assert.equal(
  read("src/hooks/I18nContext.tsx").split('"pin.freeMemoryLimitReached"')
    .length - 1,
  2,
  "The Free memory limit message must exist in both languages.",
);

console.log("free mode contract: ok");
