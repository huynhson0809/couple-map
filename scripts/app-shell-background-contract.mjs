import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

const app = readProjectFile("src/App.tsx");

assert.match(
  app,
  /const\s+backgroundImageUrl\s*=\s*bgUrl\s*\?\s*getImageUrl\(\s*bgUrl,\s*1200\s*\)\s*:\s*undefined\s*;/,
  "PairedShell should derive the transformed background image URL independently of the current route",
);

const preloadEffect = app.match(
  /\/\/ Warm the shell background[\s\S]*?useEffect\(\(\)\s*=>\s*\{[\s\S]*?new\s+Image\(\)[\s\S]*?backgroundImageUrl[\s\S]*?\},\s*\[backgroundImageUrl\]\);/,
)?.[0];

assert.ok(
  preloadEffect,
  "PairedShell should preload the transformed background image URL as soon as couple data is available",
);
assert.doesNotMatch(
  preloadEffect,
  /isMap/,
  "background preloading must not be gated by the map route",
);
assert.match(
  preloadEffect,
  /if\s*\(!backgroundImageUrl\)\s*\{/,
  "background preload effect should skip empty couple backgrounds",
);
assert.match(
  preloadEffect,
  /preloadImage\.src\s*=\s*backgroundImageUrl/,
  "background preload effect should warm the exact URL used by app shell pages",
);

assert.match(
  app,
  /backgroundImageUrl\s*&&\s*!isMap\s*\?\s*\(/,
  "app shell should still only paint the image on non-map routes",
);
assert.match(
  app,
  /backgroundImage:\s*`linear-gradient\([\s\S]*?url\(\$\{backgroundImageUrl\}\)`/,
  "app shell pages should reuse the preloaded transformed background URL",
);

console.log("App shell background contract passed.");
