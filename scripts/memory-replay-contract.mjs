import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import {
  buildReplaySlides,
  normalizeReplayConfig,
  REPLAY_TEMPLATES,
} from "../src/features/yearReplay/model.ts";
import { createReplayArchive } from "../src/lib/replayArchive.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(`${root}${path}`, "utf8");

const [migration, edge, app, flags, subscription, page, canvas, archiveSource] =
  await Promise.all([
    read("supabase/migration_memory_recaps.sql"),
    read("supabase/functions/generate-memory-recap/index.ts"),
    read("src/App.tsx"),
    read("src/lib/featureFlags.ts"),
    read("src/hooks/useSubscription.tsx"),
    read("src/pages/YearReplayPage.tsx"),
    read("src/lib/yearReplayCanvas.ts"),
    read("src/lib/replayArchive.ts"),
  ]);

assert.match(migration, /range_start date not null/);
assert.match(migration, /range_end date not null/);
assert.match(
  migration,
  /unique \(user_id, space_id, range_start, range_end\)/,
);
assert.match(migration, /public\.is_space_member\(space_id\)/);
assert.match(migration, /enforce_memory_recap_entitlements/);

assert.match(edge, /range_start\?: unknown/);
assert.match(edge, /range_end\?: unknown/);
assert.match(edge, /REPLAY_MAX_RANGE_DAYS/);
assert.match(edge, /timezone_offset_minutes/);
assert.doesNotMatch(edge, /const YEAR_START|const YEAR_END/);
assert.match(edge, /memory-recap:\$\{auth\.user\.id\}/);
assert.match(edge, /\.eq\("status", "active"\)/);
assert.match(edge, /chooseHighlights/);

assert.match(app, /path="\/replay\/:year"/);
assert.match(app, /!isReplay && <BottomNav/);
assert.match(flags, /VITE_YEAR_REPLAY_ENABLED/);
assert.match(page, /search\.get\("from"\)/);
assert.match(page, /search\.get\("to"\)/);
assert.match(page, /Save full Replay/);
assert.doesNotMatch(page, /sticker/i);
assert.doesNotMatch(canvas, /sticker/i);
assert.match(page, /for \(const \[index, replaySlide\] of slides\.entries\(\)\)/);
assert.match(archiveSource, /createReplayArchive/);
assert.match(canvas, /shareReplayFiles/);
assert.match(subscription, /replayTemplates/);
assert.match(subscription, /replayAdvancedStyling/);
assert.match(subscription, /replayHasWatermark/);
assert.match(canvas, /REPLAY_CANVAS_WIDTH = 1080/);
assert.match(canvas, /REPLAY_CANVAS_HEIGHT = 1920/);

assert.deepEqual(
  REPLAY_TEMPLATES.map((template) => template.minimumPlan),
  ["free", "plus", "pro"],
);

const snapshot = {
  version: 1,
  generated_for_user_id: "user-1",
  space: { id: "space-1", name: "My Map", type: "personal" },
  range: {
    start: "2026-02-10",
    end: "2026-03-20",
    preset: "custom",
    timezone_offset_minutes: 420,
  },
  variant: "full",
  totals: {
    memories: 8,
    cities: 3,
    countries: 1,
    active_days: 7,
    distance_km: 128.4,
    reactions: 3,
    comments: 2,
  },
  top_month: { key: "2026-03", memory_count: 5 },
  top_place: { name: "Da Nang", memory_count: 4 },
  month_activity: [
    { key: "2026-02", memory_count: 3 },
    { key: "2026-03", memory_count: 5 },
  ],
  contributors: [
    {
      user_id: "user-1",
      display_name: "Sterling",
      avatar_url: null,
      memory_count: 8,
    },
  ],
  route_points: [
    {
      id: "pin-1",
      title: "Beach",
      created_at: "2026-02-10T01:00:00Z",
      lat: 16.05,
      lng: 108.2,
      city: "Da Nang",
    },
    {
      id: "pin-2",
      title: "Coffee",
      created_at: "2026-03-20T02:00:00Z",
      lat: 16.07,
      lng: 108.22,
      city: "Da Nang",
    },
  ],
  highlights: [],
  media_library: [],
  first_memory: null,
  last_memory: null,
};

const config = normalizeReplayConfig(null);
const legacyConfig = normalizeReplayConfig({
  stickers: { cover: [{ id: "old-sticker" }] },
});
assert.ok(!("stickers" in legacyConfig));
const slides = buildReplaySlides(snapshot, config, "en");
assert.equal(slides[0].id, "cover");
assert.equal(slides.at(-1).id, "closing");
assert.ok(slides.some((slide) => slide.id === "route"));
assert.ok(slides.some((slide) => slide.id === "months"));
assert.match(slides[0].subtitle, /Feb 10, 2026/);
assert.match(slides[0].subtitle, /Mar 20, 2026/);

const hidden = buildReplaySlides(
  snapshot,
  { ...config, hiddenSlideIds: ["stats"] },
  "en",
);
assert.ok(!hidden.some((slide) => slide.id === "stats"));
assert.equal(hidden[0].id, "cover");
assert.equal(hidden.at(-1).id, "closing");

const archive = await createReplayArchive(
  [new File(["slide-one"], "slide-01.png", { type: "image/png" })],
  "2026-01-01",
);
const archiveEntries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
assert.equal(archive.name, "pinly-replay-20260101.zip");
assert.equal(strFromU8(archiveEntries["slide-01.png"]), "slide-one");

console.log("Memory Replay contracts passed.");
