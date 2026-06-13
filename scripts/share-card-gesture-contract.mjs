import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, "../src/components/share/ShareCard.tsx");
const source = readFileSync(sourcePath, "utf8");

function functionBody(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} is missing`);

  const braceStart = source.indexOf("{", start);
  assert.notEqual(braceStart, -1, `${name} has no body`);

  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const char = source[i];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(braceStart + 1, i);
  }

  throw new Error(`${name} body did not close`);
}

const downloadBody = functionBody("handleDownload");
const shareBody = functionBody("handleShare");
const shareAssetBody = functionBody("shareAsset");

assert.match(
  source,
  /useEffect\(/,
  "Share card image should be prepared before the user taps share/download.",
);

for (const [name, body] of [
  ["handleDownload", downloadBody],
  ["handleShare", shareBody],
]) {
  assert.doesNotMatch(
    body,
    /await\s+generateImage\(/,
    `${name} must not await image generation inside the tap handler; mobile browsers can drop user activation.`,
  );
  assert.doesNotMatch(
    body,
    /\bgenerateImage\(/,
    `${name} must use the already prepared asset instead of generating inside the tap handler.`,
  );
}

assert.match(
  shareAssetBody,
  /navigator\s*\.\s*share/,
  "shareAsset should still use the Web Share API when available.",
);

assert.match(
  shareBody,
  /\bshareAsset\(/,
  "handleShare should still route ready files through Web Share when available.",
);
