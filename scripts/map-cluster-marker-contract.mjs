import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

const mapView = readProjectFile("src/components/map/MapView.tsx");
const demoSeed = readProjectFile("supabase/script_seed_vietnam_demo_timeline_500.sql");

assert.doesNotMatch(
  mapView,
  /from\s+["']supercluster["']|new\s+Supercluster|getClusters\(|getLeaves\(/,
  "MapView memory clustering should use MapLibre's clustered GeoJSON source, not a separate Supercluster DOM-marker path.",
);
assert.match(
  mapView,
  /const\s+MEMORY_SOURCE_ID\s*=\s*["']memory-pins["']/,
  "MapView should define a stable memory GeoJSON source id.",
);
assert.match(
  mapView,
  /map\.addSource\(MEMORY_SOURCE_ID,\s*\{[\s\S]*type:\s*["']geojson["'][\s\S]*cluster:\s*true[\s\S]*clusterProperties/,
  "MapView should add a clustered GeoJSON source with aggregate memory count properties.",
);
assert.match(
  mapView,
  /clusterProperties:\s*\{[\s\S]*memoryCount:\s*\[\s*["']\+["'],\s*\[\s*["']get["'],\s*["']memoryCount["']\s*\]\s*\]/,
  "Cluster labels should count actual memories, including same-place grouped memories.",
);
assert.match(
  mapView,
  /id:\s*MEMORY_CLUSTER_CIRCLE_LAYER[\s\S]*type:\s*["']circle["'][\s\S]*filter:\s*\[\s*["']has["'],\s*["']point_count["']\s*\]/,
  "MapView should render clusters as MapLibre circle layers.",
);
assert.match(
  mapView,
  /id:\s*MEMORY_PIN_LABEL_LAYER[\s\S]*type:\s*["']symbol["'][\s\S]*filter:\s*\[\s*["']==["'],\s*\[\s*["']get["'],\s*["']type["']\s*\],\s*["']memory-pin["']\s*\]/,
  "Unclustered memory pins should render as MapLibre symbol layers from feature geometry.",
);
assert.match(
  mapView,
  /function\s+buildMemoryFeatureCollection\(/,
  "MapView should build GeoJSON features from current pins.",
);
assert.match(
  mapView,
  /function\s+pinToMemoryFeature\([\s\S]*coordinates:\s*\[pin\.lng,\s*pin\.lat\]/,
  "Individual memory features must use the stored pin lng/lat coordinates.",
);
assert.match(
  mapView,
  /const\s+markerImageUrl\s*=\s*pin\.marker_image_url[\s\S]*getImageUrl\(pin\.marker_image_url/,
  "Individual memory features should preserve custom marker images for sprite rendering.",
);
assert.match(
  mapView,
  /iconImageId:\s*getMemorySpriteId\(/,
  "Individual memory features should carry a MapLibre sprite image id.",
);
assert.match(
  mapView,
  /function\s+syncMemorySource\(/,
  "MapView should sync memory GeoJSON through source.setData.",
);
assert.match(
  mapView,
  /function\s+registerMemorySprites\(/,
  "MapView should register generated marker sprites before rendering pin symbols.",
);
assert.match(
  mapView,
  /function\s+renderMemorySprite\(/,
  "MapView should render emoji/image marker badges into canvas sprites.",
);
assert.match(
  mapView,
  /function\s+loadMemorySpriteImage\(/,
  "MapView should asynchronously load custom marker images into MapLibre sprites.",
);
assert.match(
  mapView,
  /\.addImage\([\s\S]*pixelRatio:\s*MEMORY_PIN_SPRITE_PIXEL_RATIO/,
  "MapView should add generated marker sprites to the MapLibre style image registry.",
);
assert.match(
  mapView,
  /\.updateImage\(/,
  "MapView should update fallback emoji sprites when custom marker images load.",
);
assert.match(
  mapView,
  /getClusterExpansionZoom\(clusterId\)/,
  "Cluster clicks should use MapLibre GeoJSONSource.getClusterExpansionZoom.",
);
assert.match(
  mapView,
  /const\s+layers\s*=\s*getExistingMemoryInteractionLayers\(map\)[\s\S]*queryRenderedFeatures\(point,\s*\{\s*layers\s*\}\)/,
  "Memory clicks should be resolved from rendered MapLibre layers.",
);
assert.match(
  mapView,
  /getFirstMemoryFeatureAtPoint\(map,\s*e\.point\)/,
  "Memory event handlers should query rendered features at the actual event point.",
);
assert.doesNotMatch(
  mapView,
  /function\s+renderMarkers\(|function\s+createPinEl\(|function\s+createClusterEl\(|markersRef\.current\.set\(g\.key|new\s+maplibregl\.Marker\(\{ element: el, anchor: ["']center["'] \}\)[\s\S]{0,160}g\.center/,
  "Memory pins and clusters must not be rendered as DOM markers.",
);
assert.match(
  mapView,
  /id:\s*MEMORY_PIN_LABEL_LAYER[\s\S]*["']icon-image["']:\s*\[\s*["']get["'],\s*["']iconImageId["']\s*\]/,
  "Unclustered memory pins should render custom marker sprites through icon-image.",
);
assert.match(
  mapView,
  /const\s+SAME_PLACE_RADIUS_METERS\s*=/,
  "MapView should keep a small same-place radius for memories created at the same venue.",
);
assert.match(
  mapView,
  /function\s+groupPinsBySamePlace\(/,
  "MapView should keep same-place memory groups as single features at high zoom.",
);
assert.match(
  mapView,
  /function\s+isSamePlaceGroup\(/,
  "MapView should detect same-place groups by real coordinate distance instead of only exact floating-point equality.",
);
assert.doesNotMatch(
  mapView,
  /CLUSTER_LAND_|findNearestLandLngLat|isRenderedLand|isRenderedWaterOrMarine|ferry|maritime/,
  "Runtime cluster positioning must not infer or mutate coordinates from rendered basemap land/water layers.",
);
assert.doesNotMatch(
  mapView,
  /Grid-based spatial bucketing|const\s+grid\s*=\s*new Map|shouldClusterPins\(|distanceMeters\(/,
  "MapView should not keep the old custom grid clustering path.",
);
assert.doesNotMatch(
  mapView,
  /const\s+queue\s*=\s*\[it\]|queue\.push\(other\)|for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*queue\.length/,
  "Map clustering should not use transitive queue expansion because coastal chains can collapse into offshore mega-clusters.",
);
assert.doesNotMatch(
  mapView,
  /Vietnam|vietnam|province|macro|semantic|regional/i,
  "Runtime map clustering must be global and must not contain country-specific aggregation.",
);
assert.doesNotMatch(
  demoSeed,
  /l\.lat\s*\+\s*sin\(|l\.lng\s*\+\s*cos\(/,
  "Demo Vietnam seed data should not jitter coastal/island coordinates into water at marketing zoom levels.",
);
assert.doesNotMatch(
  demoSeed,
  /'Cô Tô'|'Lý Sơn'|'Côn Đảo'|'Phú Quốc'/,
  "Demo marketing seed should avoid island-only anchors that look offshore at country zoom levels.",
);

console.log("Map cluster marker contract passed.");
