import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

const styles = readProjectFile("src/index.css");

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${selector} block is missing`);
  return match[1];
}

const pinDetail = readProjectFile("src/components/pins/PinDetail.tsx");
const commentComposer = cssBlock(".pin-comment-form textarea");

assert.match(
  pinDetail,
  /COMMENT_COMPOSER_ACTIVE_CLASS\s*=\s*["']pin-comment-composer-active["']/,
  "comment composer should own a keyboard-safe class used to disable iOS-hostile glass layers",
);
assert.match(
  pinDetail,
  /document\.documentElement\.classList\.toggle\(\s*COMMENT_COMPOSER_ACTIVE_CLASS,\s*active\s*\)/,
  "comment composer focus mode should toggle the keyboard-safe class on the root element",
);
assert.match(
  pinDetail,
  /onPointerDown=\{handleCommentComposerPointerDown\}/,
  "comment composer should enable keyboard-safe mode on pointerdown before iOS places the caret",
);
assert.match(
  pinDetail,
  /onFocus=\{handleCommentComposerFocus\}/,
  "comment composer should also enable keyboard-safe mode for programmatic focus",
);
assert.match(
  pinDetail,
  /onBlur=\{handleCommentComposerBlur\}/,
  "comment composer should disable keyboard-safe mode after focus leaves",
);
assert.match(
  pinDetail,
  /return\s+\(\)\s*=>\s*setCommentComposerLayerMode\(false\)/,
  "comment composer should clean up keyboard-safe mode when the detail sheet unmounts",
);
assert.match(
  pinDetail,
  /<textarea[\s\S]*rows=\{1\}[\s\S]*value=\{commentText\}/,
  "comment composer should use a one-row textarea so iOS does not mispaint the empty caret baseline",
);
assert.doesNotMatch(
  pinDetail,
  /scrollIntoView\(/,
  "comment composer focus should not programmatically scroll after iOS places the native caret",
);
assert.doesNotMatch(
  pinDetail,
  /setTimeout\([\s\S]{0,160}scrollIntoView/,
  "comment composer should not delay-scroll during keyboard open because it desynchronizes the iOS caret overlay",
);
assert.doesNotMatch(
  pinDetail,
  /behavior:\s*["']smooth["']/,
  "comment input focus must not smooth-scroll during mobile keyboard open",
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
assert.match(
  commentComposer,
  /scroll-margin-bottom:\s*18px/,
  "comment textarea should leave a small keyboard margin without JS scrolling",
);
assert.match(
  styles,
  /@supports\s*\(-webkit-touch-callout:\s*none\)[\s\S]*html\.pin-comment-composer-active\s+\.sheet-backdrop\.lg-overlay-backdrop[\s\S]*-webkit-backdrop-filter:\s*none\s*!important/,
  "iOS keyboard-safe mode should remove backdrop filtering from the overlay while the comment composer is active",
);
assert.match(
  styles,
  /html\.pin-comment-composer-active\s+\.sheet:has\(\.pin-detail\)[\s\S]*-webkit-backdrop-filter:\s*none\s*!important/,
  "iOS keyboard-safe mode should remove backdrop filtering from the sheet while the comment composer is active",
);
assert.match(
  styles,
  /html\.pin-comment-composer-active\s+\.pin-comment-main[\s\S]*-webkit-backdrop-filter:\s*none\s*!important/,
  "iOS keyboard-safe mode should remove backdrop filtering from comment bubbles around the active composer",
);

console.log("Pin comment caret contract passed.");
