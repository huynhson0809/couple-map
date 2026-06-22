import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

const timelinePage = readProjectFile("src/pages/TimelinePage.tsx");
const styles = readProjectFile("src/index.css");
const timelineViewMode = readProjectFile("src/lib/timelineViewMode.ts");

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
assert.match(
  timelineViewMode,
  /TIMELINE_VIEW_MODE_STORAGE_KEY\s*=\s*["']pinly\.timeline\.viewMode["']/,
  "timeline view mode should have a stable localStorage key",
);
assert.match(
  timelineViewMode,
  /function\s+readTimelineViewMode\(\)[\s\S]*localStorage\.getItem\(TIMELINE_VIEW_MODE_STORAGE_KEY\)/,
  "timeline view mode should hydrate from localStorage on next access",
);
assert.match(
  timelineViewMode,
  /function\s+writeTimelineViewMode\(mode:\s*TimelineViewMode\)[\s\S]*localStorage\.setItem\(TIMELINE_VIEW_MODE_STORAGE_KEY,\s*mode\)/,
  "timeline view mode should persist changes to localStorage",
);
assert.match(
  timelinePage,
  /useState<TimelineViewMode>\(\(\)\s*=>\s*readTimelineViewMode\(\)\s*,?\s*\)/,
  "timeline view mode state should initialize from saved preference",
);
assert.match(
  timelinePage,
  /function\s+handleViewModeChange\(mode:\s*TimelineViewMode\)[\s\S]*setViewMode\(mode\)[\s\S]*writeTimelineViewMode\(mode\)/,
  "timeline view mode segmented control should save the selected mode",
);
assert.match(
  timelinePage,
  /timeline-filters-open/,
  "timeline page should expose a class while filters are open so adjacent controls can avoid overlapping the popover",
);
assert.match(
  styles,
  /\.page-timeline\.timeline-filters-open\s+\.timeline-view-switch[\s\S]{0,260}visibility:\s*hidden/,
  "timeline view switch should be hidden while the filter popover is open",
);
assert.match(
  styles,
  /\.page-timeline\.timeline-filters-open\s+\.timeline-view-switch[\s\S]{0,260}pointer-events:\s*none/,
  "hidden timeline view switch should not steal taps from the filter popover",
);
