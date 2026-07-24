import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  getMapStylePreviewCenter,
  shouldAutoLocateMap,
} from "../src/lib/mapDefaults.ts";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

assert.deepEqual(DEFAULT_MAP_CENTER, { lat: 20, lng: 0 });
assert.ok(
  DEFAULT_MAP_ZOOM <= 3,
  "An empty international map should open at a world-level zoom.",
);
assert.notDeepEqual(
  getMapStylePreviewCenter("en"),
  getMapStylePreviewCenter("vi"),
  "English map style previews should not always be centered in Vietnam.",
);

assert.equal(
  shouldAutoLocateMap({
    permissionState: "granted",
    pinCount: 0,
    hasExplicitCameraIntent: false,
  }),
  true,
);
assert.equal(
  shouldAutoLocateMap({
    permissionState: "prompt",
    pinCount: 0,
    hasExplicitCameraIntent: false,
  }),
  false,
  "Opening the map must not cause an unexpected location permission prompt.",
);
assert.equal(
  shouldAutoLocateMap({
    permissionState: "granted",
    pinCount: 1,
    hasExplicitCameraIntent: false,
  }),
  false,
  "Saved memories should take priority over automatic location.",
);
assert.equal(
  shouldAutoLocateMap({
    permissionState: "granted",
    pinCount: 0,
    hasExplicitCameraIntent: true,
  }),
  false,
  "A deep link or explicit fly-to target must take priority.",
);

const mapPage = readProjectFile("src/pages/MapPage.tsx");
const mapView = readProjectFile("src/components/map/MapView.tsx");
const settingsPage = readProjectFile("src/pages/SettingsPage.tsx");

assert.match(mapPage, /useState\(\{ \.\.\.DEFAULT_MAP_CENTER \}\)/);
assert.match(
  mapView,
  /center: \[DEFAULT_MAP_CENTER\.lng, DEFAULT_MAP_CENTER\.lat\]/,
);
assert.match(mapView, /zoom: DEFAULT_MAP_ZOOM/);
assert.match(mapView, /navigator\.permissions\.query/);
assert.match(mapView, /shouldAutoLocateMap/);
assert.doesNotMatch(mapView, /106\.6297|10\.8231/);
assert.match(settingsPage, /getMapStylePreviewCenter\(lang\)/);

console.log("international map defaults contract: ok");
