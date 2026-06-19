import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

function cssBlock(selector) {
  const styles = readProjectFile("src/index.css");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${selector} block is missing`);
  return match[1];
}

const pinDetail = readProjectFile("src/components/pins/PinDetail.tsx");
const commentInput = cssBlock(".pin-comment-form input");

assert.match(
  pinDetail,
  /scrollIntoView\(\{\s*block:\s*"nearest",\s*inline:\s*"nearest"\s*\}\)/,
  "comment input focus should only keep the field nearby during keyboard open",
);
assert.doesNotMatch(
  pinDetail,
  /behavior:\s*["']smooth["']/,
  "comment input focus must not smooth-scroll during mobile keyboard open",
);

assert.match(
  commentInput,
  /height:\s*42px/,
  "comment input should keep the existing 42px visual height",
);
assert.match(
  commentInput,
  /min-height:\s*42px/,
  "comment input should keep the existing minimum tap target",
);
assert.match(
  commentInput,
  /padding:\s*0\s+12px/,
  "comment input should let the native single-line control center empty caret vertically",
);
assert.match(
  commentInput,
  /line-height:\s*normal/,
  "comment input should avoid fixed px line-height that misaligns empty iOS carets",
);
assert.doesNotMatch(
  commentInput,
  /line-height:\s*\d+px/,
  "comment input should not use fixed pixel line-height on iOS",
);
assert.match(
  commentInput,
  /-webkit-appearance:\s*none/,
  "comment input should reset mobile native appearance",
);
assert.match(
  commentInput,
  /-webkit-backdrop-filter:\s*none/,
  "comment input should avoid filtered native input surface on mobile",
);

console.log("Pin comment caret contract passed.");
