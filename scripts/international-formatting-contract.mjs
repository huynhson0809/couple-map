import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  differenceInCalendarDays,
  formatLocalDateInputValue,
  localeForLanguage,
} from "../src/lib/localeFormat.ts";
import { formatRelativeTime } from "../src/lib/relativeTime.ts";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

assert.equal(localeForLanguage("vi"), "vi-VN");
assert.equal(localeForLanguage("en"), "en-US");
assert.equal(localeForLanguage("fr"), "en-US");
assert.equal(
  formatLocalizedDate(new Date(2026, 6, 22), "en"),
  "7/22/2026",
);
assert.equal(
  formatLocalizedDate(new Date(2026, 6, 22), "vi"),
  "22/7/2026",
);
assert.equal(
  formatLocalizedDate("2026-07-22", "en", {
    timeZone: "America/Los_Angeles",
  }),
  "7/22/2026",
  "Date-only values must not shift to the previous day in western time zones.",
);
assert.equal(formatLocalizedNumber(1234.5, "en"), "1,234.5");
assert.equal(formatLocalizedNumber(1234.5, "vi"), "1.234,5");
assert.equal(
  formatLocalDateInputValue(new Date(2026, 6, 22, 23, 30)),
  "2026-07-22",
  "Date input bounds must use the user's local calendar date instead of UTC.",
);
const relativeNow = new Date("2026-07-22T12:00:00.000Z").getTime();
assert.equal(
  formatRelativeTime("2026-07-22T11:55:00.000Z", "en", relativeNow),
  "5 minutes ago",
);
assert.equal(
  formatRelativeTime("2026-07-22T11:55:00.000Z", "vi", relativeNow),
  "5 phút trước",
);
assert.equal(
  differenceInCalendarDays("2026-03-07", new Date(2026, 2, 9)),
  2,
  "Calendar-day stats must remain stable across timezone and DST boundaries.",
);

const settings = readProjectFile("src/pages/SettingsPage.tsx");
const timeline = readProjectFile("src/pages/TimelinePage.tsx");
const replay = readProjectFile("src/pages/YearReplayPage.tsx");
const shareCard = readProjectFile("src/components/share/ShareCard.tsx");
const pinDetail = readProjectFile("src/components/pins/PinDetail.tsx");
const anniversaryPrompt = readProjectFile("src/components/onboard/AnniversaryPrompt.tsx");

assert.doesNotMatch(settings, /toLocaleDateString\("vi-VN"\)/);
for (const source of [timeline, replay, shareCard, pinDetail]) {
  assert.match(source, /formatLocalizedDate/);
  assert.doesNotMatch(source, /toLocaleDateString\([^)]*undefined/);
}
for (const source of [settings, anniversaryPrompt]) {
  assert.match(source, /formatLocalDateInputValue\(\)/);
  assert.doesNotMatch(source, /toISOString\(\)\.split\(["']T["']\)/);
}

console.log("international formatting contract: ok");
