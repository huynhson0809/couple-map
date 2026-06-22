import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

const app = readProjectFile("src/App.tsx");
const timelinePage = readProjectFile("src/pages/TimelinePage.tsx");
const memoryPage = readProjectFile("src/pages/MemoryDeepLinkPage.tsx");
const timelineViewMode = readProjectFile("src/lib/timelineViewMode.ts");
const sendPush = readProjectFile("supabase/functions/send-push/index.ts");
const notificationToast = readProjectFile("src/components/ui/NotificationToast.tsx");

assert.match(
  app,
  /const\s+MemoryDeepLinkPage\s*=\s*lazy\(/,
  "app should lazy-load the memory deep-link page",
);
assert.match(
  app,
  /<Route\s+path=["']\/memory\/:pinId["']\s+element=\{<MemoryDeepLinkPage\s*\/>\}\s*\/>/,
  "app should register /memory/:pinId route",
);
assert.match(
  sendPush,
  /data:\s*\{\s*url:\s*context\.pinId\s*\?\s*`\/memory\/\$\{context\.pinId\}`\s*:\s*["']\/["']\s*\}/,
  "push payload should deep-link directly to /memory/<pinId>",
);
assert.match(
  notificationToast,
  /data:\s*\{\s*url:\s*`\/memory\/\$\{pin\.id\}`\s*\}/,
  "local hidden-page notification should use /memory/<pinId>",
);
assert.match(
  notificationToast,
  /onClick:\s*\(\)\s*=>\s*\{[\s\S]*navigate\(`\/memory\/\$\{pin\.id\}`\)/,
  "fallback Notification click should also use the lightweight /memory/<pinId> route",
);
assert.match(
  timelineViewMode,
  /export\s+type\s+TimelineViewMode\s*=\s*["']list["']\s*\|\s*["']circle["']/,
  "timeline view mode type should be shared",
);
assert.match(
  timelineViewMode,
  /export\s+const\s+TIMELINE_VIEW_MODE_STORAGE_KEY\s*=\s*["']pinly\.timeline\.viewMode["']/,
  "timeline view mode storage key should remain stable",
);
assert.match(
  timelineViewMode,
  /export\s+function\s+readTimelineViewMode\(\)[\s\S]*localStorage\.getItem\(TIMELINE_VIEW_MODE_STORAGE_KEY\)/,
  "shared timeline view mode helper should read localStorage",
);
assert.match(
  timelineViewMode,
  /export\s+function\s+writeTimelineViewMode\(mode:\s*TimelineViewMode\)[\s\S]*localStorage\.setItem\(TIMELINE_VIEW_MODE_STORAGE_KEY,\s*mode\)/,
  "shared timeline view mode helper should write localStorage",
);
assert.match(
  memoryPage,
  /useParams<\{\s*pinId:\s*string\s*\}>/,
  "memory deep-link page should read pinId from route params",
);
assert.match(
  memoryPage,
  /<TimelinePageContent\s+deepLinkPinId=\{pinId\}/,
  "memory deep-link page should reuse the Timeline page content",
);
assert.match(
  memoryPage,
  /window\.history\.replaceState\([\s\S]*["']\/timeline["'][\s\S]*\)/,
  "memory deep-link page should seed Timeline as the browser-back destination",
);
assert.match(
  memoryPage,
  /window\.history\.pushState\([\s\S]*currentRoute[\s\S]*\)/,
  "memory deep-link page should restore the /memory route above the Timeline backstop",
);
assert.match(
  timelinePage,
  /export\s+function\s+TimelinePageContent\(\{[\s\S]*deepLinkPinId/,
  "Timeline page content should accept a deepLinkPinId prop",
);
assert.match(
  timelinePage,
  /loadPinById\(deepLinkPinId\)/,
  "Timeline deep-link flow should fetch the target pin directly by id",
);
assert.match(
  timelinePage,
  /open=\{!!selectedPin\s*\|\|\s*deepLinkLoading\s*\|\|\s*!!deepLinkError\}/,
  "deep-link detail sheet should open immediately with loading and error states",
);
assert.match(
  timelinePage,
  /navigate\(["']\/timeline["'],\s*\{\s*replace:\s*true\s*\}\)/,
  "closing a deep-link detail sheet should return to Timeline",
);
assert.match(
  timelinePage,
  /useState<TimelineViewMode>\(\(\)\s*=>\s*readTimelineViewMode\(\)\s*,?\s*\)/,
  "Timeline content should initialize from the saved view mode",
);
