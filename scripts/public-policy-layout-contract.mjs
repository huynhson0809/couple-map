import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const app = readFileSync(resolve("src/App.tsx"), "utf8");
const publicPolicy = readFileSync(
  resolve("src/pages/PublicPolicyPage.tsx"),
  "utf8",
);
const publicContent = readFileSync(
  resolve("src/pages/PublicContentPage.tsx"),
  "utf8",
);

assert.equal(
  packageJson.scripts["check:public-policy-layout"],
  "node scripts/public-policy-layout-contract.mjs",
  "package.json should expose the public policy layout contract.",
);

const signedOutRoutesStart = app.indexOf("if (!user)");
const signedInRoutesStart = app.indexOf(
  "\n  return (\n    <Routes>",
  signedOutRoutesStart,
);
const signedOutRoutes = app.slice(signedOutRoutesStart, signedInRoutesStart);
const signedInRoutes = app.slice(signedInRoutesStart);

assert.match(
  signedOutRoutes,
  /<PublicPolicyPage kind="privacy" language="en" \/>/,
  "Signed-out privacy should use the public policy layout.",
);
assert.match(
  signedOutRoutes,
  /<PublicPolicyPage kind="terms" language="en" \/>/,
  "Signed-out terms should use the public policy layout.",
);
assert.match(
  signedOutRoutes,
  /<PublicPolicyPage kind="privacy" language="vi" \/>/,
  "Signed-out privacy should have a distinct Vietnamese route.",
);
assert.match(
  signedInRoutes,
  /path="\/privacy" element={<PrivacyPage \/>}/,
  "Signed-in privacy should keep the in-app policy layout.",
);
assert.match(
  signedInRoutes,
  /path="\/terms" element={<TermsPage \/>}/,
  "Signed-in terms should keep the in-app policy layout.",
);

assert.match(
  publicPolicy,
  /getLegalContent\(kind, lang\)/,
  "The public layout should reuse the canonical legal copy.",
);
assert.match(
  publicPolicy,
  /<PublicSiteHeader language={language} \/>/,
  "The public policy layout should use the shared public header.",
);
assert.match(
  publicPolicy,
  /<PublicSiteFooter language={language} \/>/,
  "The public policy layout should use the shared public footer.",
);
assert.match(
  publicContent,
  /<PublicSiteHeader activePageKey={pageKey} language={language} \/>/,
  "Public content pages should use the same shared header.",
);
