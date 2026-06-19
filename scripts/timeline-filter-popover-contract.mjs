import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

const timelinePage = readProjectFile("src/pages/TimelinePage.tsx");

assert.match(
  timelinePage,
  /filterPopoverRef\s*=\s*useRef<HTMLDivElement \| null>\(null\)/,
  "timeline filter popover should keep a root ref for inside/outside detection",
);
assert.match(
  timelinePage,
  /window\.addEventListener\(["']pointerdown["'],\s*handlePointerDown,\s*true\)/,
  "timeline filter popover should listen for outside pointerdown in capture phase",
);
assert.match(
  timelinePage,
  /window\.removeEventListener\(["']pointerdown["'],\s*handlePointerDown,\s*true\)/,
  "timeline filter popover should remove the capture-phase outside pointer listener",
);
assert.match(
  timelinePage,
  /closest\(\s*["']\.timeline-filter-toggle,\s*\.timeline-filter-reset,\s*\.timeline-filter-panel["']\s*,?\s*\)/,
  "timeline filter outside detection should only treat the toggle/reset/panel surfaces as inside",
);
assert.doesNotMatch(
  timelinePage,
  /filterPopoverRef\.current\?\.contains\(target\)/,
  "timeline filter outside detection must not treat blank wrapper space as inside",
);
assert.match(
  timelinePage,
  /event\.key\s*===\s*["']Escape["'][\s\S]{0,160}setFiltersOpen\(false\)/,
  "timeline filter popover should close from Escape as a keyboard fallback",
);
