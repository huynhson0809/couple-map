import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolvePublicSocialLinks } from "../src/config/publicSocialLinks.ts";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const environmentExample = readFileSync(resolve(".env.example"), "utf8");
const landingPage = readFileSync(resolve("src/pages/LandingPage.tsx"), "utf8");
const publicChrome = readFileSync(
  resolve("src/components/public/PublicSiteChrome.tsx"),
  "utf8",
);
const socialComponent = readFileSync(
  resolve("src/components/public/PublicSocialLinks.tsx"),
  "utf8",
);
const indexHtml = readFileSync(resolve("index.html"), "utf8");
const prerender = readFileSync(
  resolve("scripts/prerender-public-pages.mjs"),
  "utf8",
);

assert.equal(
  packageJson.scripts["check:public-social-links"],
  "node --experimental-strip-types scripts/public-social-links-contract.mjs",
  "package.json should expose the public social links contract.",
);

const validLinks = resolvePublicSocialLinks({
  VITE_SOCIAL_LINKEDIN_URL: "https://www.linkedin.com/company/pinly-tech",
  VITE_SOCIAL_FACEBOOK_URL: "https://facebook.com/pinly.tech",
  VITE_SOCIAL_INSTAGRAM_URL: "https://instagram.com/pinly.tech/",
  VITE_SOCIAL_THREADS_URL: "https://www.threads.net/@pinly.tech",
  VITE_SOCIAL_TIKTOK_URL: "https://www.tiktok.com/@pinly.tech",
  VITE_SOCIAL_X_URL: "https://x.com/pinlytech",
});
assert.equal(validLinks.length, 6, "All supported profile URLs should resolve.");

const invalidLinks = resolvePublicSocialLinks({
  VITE_SOCIAL_LINKEDIN_URL: "http://linkedin.com/company/pinly",
  VITE_SOCIAL_FACEBOOK_URL: "https://facebook.com/",
  VITE_SOCIAL_INSTAGRAM_URL: "https://example.com/pinly",
  VITE_SOCIAL_THREADS_URL: "https://threads.net/",
  VITE_SOCIAL_TIKTOK_URL: "",
  VITE_SOCIAL_X_URL: "not-a-url",
});
assert.equal(
  invalidLinks.length,
  0,
  "Unsafe, generic, and off-platform URLs should remain hidden.",
);

for (const key of [
  "VITE_SOCIAL_LINKEDIN_URL",
  "VITE_SOCIAL_FACEBOOK_URL",
  "VITE_SOCIAL_INSTAGRAM_URL",
  "VITE_SOCIAL_THREADS_URL",
  "VITE_SOCIAL_TIKTOK_URL",
  "VITE_SOCIAL_X_URL",
]) {
  assert.match(
    environmentExample,
    new RegExp(`^${key}=`, "m"),
    `${key} should be documented in .env.example.`,
  );
}

assert.match(
  landingPage,
  /<PublicSocialLinks language={language} tone="light" \/>/,
  "The landing footer should render the shared social profiles.",
);
assert.match(
  publicChrome,
  /<PublicSocialLinks language={language} tone="dark" \/>/,
  "Public content pages should render the shared social profiles.",
);
assert.match(
  socialComponent,
  /rel="me noopener noreferrer"/,
  "Profile links should expose an identity relationship safely.",
);
assert.match(
  indexHtml,
  /id="pinly-organization-schema"[\s\S]*"sameAs": \[\]/,
  "The base Organization schema should provide a sameAs target.",
);
assert.match(
  prerender,
  /applyOrganizationSameAs/,
  "Prerendering should inject configured profiles into Organization.sameAs.",
);
