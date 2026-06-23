import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

function readFunctionBody(source, functionName) {
  const signature = new RegExp(
    `(?:async\\s+)?function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`,
  );
  const match = signature.exec(source);
  assert.ok(match, `${functionName} should exist.`);

  let depth = 1;
  let index = match.index + match[0].length;
  const bodyStart = index;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index);
  }

  throw new Error(`Could not read ${functionName} body.`);
}

const mapPage = readProjectFile("src/pages/MapPage.tsx");
const createPinForm = readProjectFile("src/components/pins/CreatePinForm.tsx");
const handleFabClickBody = readFunctionBody(mapPage, "handleFabClick");

assert.doesNotMatch(
  mapPage,
  /const\s+GPS_QUICK_MS/,
  "Map add FAB should not keep a GPS wait timeout; the sheet must open immediately.",
);
assert.doesNotMatch(
  mapPage,
  /async\s+function\s+handleFabClick/,
  "Map add FAB click should not be async because awaiting GPS blocks the modal.",
);
assert.doesNotMatch(
  handleFabClickBody,
  /await\s+|Promise\.race|setTimeout\(/,
  "Map add FAB click should never wait for GPS before opening the modal.",
);
assert.match(
  handleFabClickBody,
  /const\s+initialCoords\s*=\s*getInitialNewPinCoords\(\)/,
  "Map add FAB should resolve an immediate initial coordinate.",
);
assert.match(
  handleFabClickBody,
  /openNewPinSheet\(initialCoords\)/,
  "Map add FAB should open the create sheet immediately with initial coordinates.",
);
assert.match(
  handleFabClickBody,
  /void\s+getCurrentPosition\(\)\s*\.then/,
  "Map add FAB should refine GPS in the background after the sheet is open.",
);
assert.match(
  mapPage,
  /const\s+addPinGpsRequestRef\s*=\s*useRef\(0\)/,
  "Background GPS refinement should use a request id to ignore stale results.",
);
assert.match(
  mapPage,
  /function\s+closeNewPinSheet\(\)[\s\S]*addPinGpsRequestRef\.current\s*\+=\s*1[\s\S]*setNewPinCoords\(null\)/,
  "Closing the create sheet should cancel stale GPS refinements and clear coordinates.",
);
assert.match(
  mapPage,
  /onClose=\{closeNewPinSheet\}/,
  "BottomSheet close should use the shared add-pin close handler.",
);
assert.match(
  createPinForm,
  /manualPinCoordsRef\s*=\s*useRef\(false\)/,
  "CreatePinForm should track when the user manually chooses a place so GPS refinement does not overwrite it.",
);
assert.match(
  createPinForm,
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*if\s*\(manualPinCoordsRef\.current\s*\|\|\s*addressEdited\)\s*return[\s\S]*setPinCoords\(coords\)[\s\S]*\},\s*\[addressEdited,\s*coords,\s*coords\.accuracy,\s*coords\.lat,\s*coords\.lng\]\)/,
  "CreatePinForm should sync late GPS-refined coords from the parent after the sheet has already opened.",
);
assert.match(
  createPinForm,
  /function\s+selectAddressResult\([^)]*\)\s*\{[\s\S]*manualPinCoordsRef\.current\s*=\s*true[\s\S]*setPinCoords\(/,
  "Manually selected address coordinates should opt out of later automatic GPS coordinate sync.",
);

console.log("Map add pin FAB contract passed.");
