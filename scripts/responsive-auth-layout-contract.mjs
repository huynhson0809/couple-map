import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const authShell = readFileSync(
  resolve("src/components/auth/AuthShell.tsx"),
  "utf8",
);
const consentGate = readFileSync(
  resolve("src/components/auth/ConsentGate.tsx"),
  "utf8",
);
const styles = readFileSync(resolve("src/index.css"), "utf8");

assert.equal(
  packageJson.scripts["check:responsive-auth-layout"],
  "node scripts/responsive-auth-layout-contract.mjs",
  "package.json should expose the responsive auth layout contract.",
);

assert.match(
  authShell,
  /className="auth-layout"[\s\S]*className="auth-panel"/,
  "AuthShell should group its brand and form into a responsive layout.",
);
assert.match(
  consentGate,
  /className="auth-layout"[\s\S]*className="auth-panel"/,
  "ConsentGate should use the same responsive auth layout.",
);
assert.match(
  styles,
  /#root:has\(\.auth-shell\)/,
  "Auth routes should opt out of the app's phone-width root constraint.",
);
assert.match(
  styles,
  /\.auth-shell\s*\{[\s\S]*?max-width:\s*none;/,
  "The auth shell should fill the available viewport.",
);
assert.match(
  styles,
  /@media\s*\(min-width:\s*768px\)[\s\S]*?\.auth-shell \.auth-layout\s*\{[\s\S]*?grid-template-columns:/,
  "Tablet and desktop auth screens should use a multi-column layout.",
);
assert.match(
  styles,
  /\.auth-shell \.auth-layout\s*\{[\s\S]*?width:\s*min\(100%,\s*430px\);/,
  "Mobile auth content should retain a readable single-column measure.",
);
