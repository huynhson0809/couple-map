import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

const createPinForm = readProjectFile("src/components/pins/CreatePinForm.tsx");
const pinMediaUpload = readProjectFile("src/lib/pinMediaUpload.ts");
const imageCompress = readProjectFile("src/lib/imageCompress.ts");
const cloudinary = readProjectFile("src/lib/cloudinary.ts");
const timelinePage = readProjectFile("src/pages/TimelinePage.tsx");
const pinDetail = readProjectFile("src/components/pins/PinDetail.tsx");
const styles = readProjectFile("src/index.css");

assert.doesNotMatch(
  createPinForm,
  /src=\{URL\.createObjectURL\(/,
  "create memory previews must not create blob URLs during render",
);
assert.match(
  createPinForm,
  /URL\.revokeObjectURL/,
  "create memory preview blob URLs must be revoked on remove/unmount",
);
assert.match(
  createPinForm,
  /decoding="async"/,
  "create memory image previews should decode asynchronously",
);
assert.match(
  createPinForm,
  /preload="metadata"/,
  "create memory video previews should only preload metadata",
);
assert.doesNotMatch(
  createPinForm,
  /await\s+savePendingUploads/,
  "save memory should not wait for large files to be copied into IndexedDB before returning to the UI",
);
assert.match(
  createPinForm,
  /startAfterNextPaint\(\(\) => \{[\s\S]{0,120}savePendingUploads/,
  "pending media persistence should start in the background after the created-memory UI paints",
);

assert.doesNotMatch(
  pinMediaUpload,
  /Promise\.all\(/,
  "media upload should not compress/upload every selected file at once on mobile",
);
assert.match(
  imageCompress,
  /onProgress/,
  "image compression should surface progress for smoother upload feedback",
);
assert.match(
  cloudinary,
  /XMLHttpRequest/,
  "Cloudinary uploads should use XHR to report upload progress",
);
assert.match(
  cloudinary,
  /upload\.onprogress/,
  "Cloudinary upload progress should be wired from xhr.upload.onprogress",
);

assert.match(
  timelinePage,
  /--timeline-upload-progress/,
  "timeline upload progress should be driven by a transform-friendly CSS variable",
);
assert.match(
  styles,
  /transform:\s*scaleX\(var\(--timeline-upload-progress/,
  "timeline upload bar should animate transform instead of width",
);
assert.doesNotMatch(
  styles,
  /\.timeline-upload-bar-fill[\s\S]{0,260}transition:\s*width/,
  "timeline upload bar should not animate layout width",
);

assert.doesNotMatch(
  pinDetail,
  /behavior:\s*["']smooth["']/,
  "comment input focus should not smooth-scroll during mobile keyboard open",
);
assert.match(
  styles,
  /\.pin-comment-form textarea[\s\S]{0,420}-webkit-appearance:\s*none/,
  "comment textarea should reset mobile native appearance",
);
assert.match(
  styles,
  /\.pin-comment-form textarea[\s\S]{0,420}padding:\s*10px\s+12px/,
  "comment textarea should center the empty iOS caret with balanced vertical padding",
);
assert.match(
  styles,
  /\.pin-comment-form textarea[\s\S]{0,420}line-height:\s*20px/,
  "comment textarea should use an explicit line box for empty iOS caret alignment",
);
assert.match(
  styles,
  /\.pin-comment-form textarea[\s\S]{0,520}-webkit-backdrop-filter:\s*none/,
  "comment textarea should avoid filtered native input surface on mobile",
);
assert.match(
  pinDetail,
  /<textarea[\s\S]*rows=\{1\}[\s\S]*value=\{commentText\}/,
  "comment composer should use a one-row textarea instead of the old empty-caret-sensitive input",
);
