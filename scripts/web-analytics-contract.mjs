import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const analyticsPackage = require("@vercel/analytics/package.json");
const appSource = readFileSync("src/App.tsx", "utf8");
const legalSource = readFileSync("src/lib/legalContent.ts", "utf8");
const { filterWebAnalyticsEvent, isTrackablePublicPath } = await import(
  "../src/lib/webAnalytics.ts"
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  Number(analyticsPackage.version.split(".")[0]) >= 2,
  "@vercel/analytics v2 or newer is required for resilient intake.",
);
assert(
  appSource.includes("<WebAnalytics />"),
  "Public routes must mount WebAnalytics.",
);
assert(
  isTrackablePublicPath("/guides/memory-map") &&
    isTrackablePublicPath("/register/"),
  "Public content and registration routes must be trackable.",
);
assert(
  !isTrackablePublicPath("/memory/private-id") &&
    !isTrackablePublicPath("/admin/support"),
  "Private memory and admin routes must not be allowlisted.",
);

globalThis.window = { location: { origin: "https://pinly.tech" } };
globalThis.document = { querySelector: () => null };
const filteredEvent = filterWebAnalyticsEvent({
  type: "pageview",
  url: "https://pinly.tech/pricing?utm_source=facebook&utm_campaign=launch&code=secret#access_token=private",
});

assert(
  filteredEvent?.url ===
    "https://pinly.tech/pricing?utm_source=facebook&utm_campaign=launch",
  "Analytics URLs must retain campaign attribution while removing sensitive query data.",
);
assert(
  filterWebAnalyticsEvent({
    type: "pageview",
    url: "https://pinly.tech/memory/private-id?utm_source=facebook",
  }) === null,
  "Private routes must be dropped before analytics submission.",
);
assert(
  filterWebAnalyticsEvent({ type: "pageview", url: "https://pinly.tech/" }) ===
    null,
  "The authenticated map at / must not be counted as a landing-page view.",
);
globalThis.document = { querySelector: () => ({ className: "lp" }) };
assert(
  filterWebAnalyticsEvent({ type: "pageview", url: "https://pinly.tech/" })
    ?.url === "https://pinly.tech/",
  "The public landing page at / must remain trackable.",
);
assert(
  legalSource.includes("Vercel Web Analytics") &&
    legalSource.includes("không dùng cookie phân tích"),
  "The privacy policy must disclose anonymous web analytics.",
);

console.log("Web analytics contract passed.");
