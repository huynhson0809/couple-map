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

assert.match(
  app,
  /useLayoutEffect\(\(\) => \{\s*if \(resetPublicScroll && !location\.hash\) \{\s*window\.scrollTo\(\{ top: 0, left: 0, behavior: "instant" \}\);/,
  "Public navigation should reset document scroll after the destination renders, without overriding fragment navigation.",
);
assert.match(
  app,
  /document\.getElementById\("root"\)\?\.scrollTo\(\{\s*top: 0,\s*left: 0,\s*behavior: "instant",?\s*\}\)/,
  "Public navigation must reset the fixed-height root scroll container, not only window scroll.",
);
assert.match(
  app,
  /\[resetPublicScroll, location\.key, location\.hash\]/,
  "Every public navigation, including another click on the current footer link, should reset scroll.",
);
assert.match(
  app,
  /publicRoute\.page\.key !== "home"\s*\|\|\s*publicRoute\.language === "vi"\s*\|\|\s*!user/,
  "Public scroll resets must not include the signed-in map or other authenticated tabs.",
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
