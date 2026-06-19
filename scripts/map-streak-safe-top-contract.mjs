import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

const mapPage = readProjectFile("src/pages/MapPage.tsx");

const safeTopGapMatch = mapPage.match(
  /const\s+STREAK_DRAG_SAFE_TOP_GAP\s*=\s*(\d+)/,
);
assert.ok(
  safeTopGapMatch,
  "Map streak drag clamp should have a dedicated safe top gap constant.",
);
assert.ok(
  Number(safeTopGapMatch[1]) >= 48,
  "Map streak drag safe top gap should be large enough to avoid OS notification gestures.",
);
assert.match(
  mapPage,
  /function\s+getSafeAreaInsetTop\(\)/,
  "Map streak drag clamp should account for the top safe-area inset.",
);
assert.match(
  mapPage,
  /const\s+minY\s*=\s*STREAK_DRAG_SAFE_TOP_GAP\s*\+\s*getSafeAreaInsetTop\(\)/,
  "Map streak drag minY should combine the safe top gap and top safe-area inset.",
);
assert.match(
  mapPage,
  /window\.visualViewport\?\.addEventListener\("resize",\s*syncPosition\)/,
  "Map streak drag position should reclamp on visualViewport resize.",
);
assert.match(
  mapPage,
  /readStreakFloatPosition\(\)\s*\?\?\s*getStreakButtonPosition\(button\)[\s\S]{0,120}clampStreakFloatPosition/,
  "Map streak drag should reclamp saved localStorage positions during hydration.",
);

console.log("Map streak safe top contract passed.");
