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
const commentComposer = cssBlock(".pin-comment-form textarea");

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
  pinDetail,
  /<textarea[\s\S]*rows=\{1\}[\s\S]*value=\{commentText\}/,
  "comment composer should use a one-row textarea so iOS does not mispaint the empty caret baseline",
);
assert.doesNotMatch(
  pinDetail,
  /<form className="pin-comment-form"[\s\S]*<input\b/,
  "comment composer should not use the old native single-line input that misaligns the empty iOS caret",
);
assert.match(
  commentComposer,
  /height:\s*42px/,
  "comment input should keep the existing 42px visual height",
);
assert.match(
  commentComposer,
  /min-height:\s*42px/,
  "comment input should keep the existing minimum tap target",
);
assert.match(
  commentComposer,
  /padding:\s*10px\s+12px/,
  "comment textarea should use balanced vertical padding so the empty iOS caret starts centered",
);
assert.match(
  commentComposer,
  /line-height:\s*20px/,
  "comment textarea should use an explicit text line box that centers inside the 42px control",
);
assert.doesNotMatch(
  commentComposer,
  /line-height:\s*normal/,
  "comment textarea should not rely on iOS normal line-height for the empty caret baseline",
);
assert.match(
  commentComposer,
  /-webkit-appearance:\s*none/,
  "comment input should reset mobile native appearance",
);
assert.match(
  commentComposer,
  /-webkit-backdrop-filter:\s*none/,
  "comment input should avoid filtered native input surface on mobile",
);
assert.match(
  commentComposer,
  /resize:\s*none/,
  "comment textarea should not expose manual resize handles",
);
assert.match(
  commentComposer,
  /overflow:\s*hidden/,
  "comment textarea should stay visually one-line while typing",
);

console.log("Pin comment caret contract passed.");
