import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const mapView = readFileSync(
  resolve("src/components/map/MapView.tsx"),
  "utf8",
);

assert.equal(
  packageJson.scripts["check:map-3d-initial-load"],
  "node scripts/map-3d-initial-load-contract.mjs",
  "package.json should expose the initial 3D map load contract.",
);

assert.match(
  mapView,
  /const\s+map3DEnabledRef\s*=\s*useRef\(map3DEnabled\)[\s\S]*map3DEnabledRef\.current\s*=\s*map3DEnabled/,
  "Imperative MapLibre callbacks should read the latest 3D preference.",
);

assert.match(
  mapView,
  /map\.once\(["']style\.load["'],\s*handleStyleLoad\)[\s\S]*map\.setStyle\(mapStyleUrl\)/,
  "Style switches should wait for style.load before restoring 3D layers.",
);

assert.doesNotMatch(
  mapView,
  /map\.once\(["']styledata["']/,
  "The first styledata event is too early to restore custom 3D layers.",
);

assert.match(
  mapView,
  /map\.on\(["']sourcedata["'],\s*handle3DSourceReady\)/,
  "3D buildings should retry when vector source metadata becomes available.",
);

assert.match(
  mapView,
  /map\.on\(["']idle["'],\s*handle3DSourceReady\)/,
  "3D buildings should receive a final retry once the map becomes idle.",
);

assert.match(
  mapView,
  /function\s+ensure3DBuildingsLayer\([\s\S]*if\s*\(!map\.isStyleLoaded\(\)\)\s*return false/,
  "The building extrusion layer must not be added before the style is ready.",
);

assert.match(
  mapView,
  /vectorSources\.length\s*===\s*1/,
  "Unknown vector sources should only be used when the source is unambiguous.",
);

console.log("Initial 3D map load contract passed.");
