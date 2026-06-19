import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildTimelineCircleLayout,
  getTimelineCircleBounds,
} from '../src/lib/timelineCircleLayout.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(__dirname, '..', path), 'utf8');
}

function functionBody(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} is missing`);

  const braceStart = source.indexOf('{', start);
  assert.notEqual(braceStart, -1, `${name} has no body`);

  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(braceStart + 1, i);
  }

  throw new Error(`${name} body did not close`);
}

const makePins = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `pin-${index}`,
    title: `Pin ${index}`,
  }));

const firstPagePins = makePins(24);
const appendedPins = makePins(48);

const firstLayout = buildTimelineCircleLayout(firstPagePins);
const repeatedFirstLayout = buildTimelineCircleLayout(firstPagePins);
const appendedLayout = buildTimelineCircleLayout(appendedPins);
const repeatedAppendedLayout = buildTimelineCircleLayout(appendedPins);

assert.deepEqual(firstLayout, repeatedFirstLayout, 'first-page layout must be deterministic');
assert.deepEqual(appendedLayout, repeatedAppendedLayout, 'appended layout must be deterministic');

assert.equal(firstLayout[0]?.id, 'pin-0', 'first node should be the newest pin');
assert.equal(firstLayout[0]?.index, 0, 'first node should keep newest index 0');
assert.equal(firstLayout[0]?.newest, true, 'first node should be marked newest');
for (const node of firstLayout.slice(1)) {
  assert.ok(firstLayout[0].size > node.size, 'newest node should be larger than every older first-page node');
}
assert.ok(firstLayout[0]?.zIndex > firstLayout[1]?.zIndex, 'newest node should layer above older pins');

for (let index = 0; index < firstLayout.length; index += 1) {
  assert.deepEqual(
    appendedLayout[index],
    firstLayout[index],
    `node ${index} should not move when more pins append`,
  );
}

const bounds = getTimelineCircleBounds(appendedLayout);
const hardenedLayout = buildTimelineCircleLayout(firstPagePins, {
  centerX: Number.NaN,
  centerY: Number.POSITIVE_INFINITY,
  radiusStep: -1,
  maxNodeSize: 0,
  minNodeSize: 1000,
  sizeFalloff: 2,
  angleJitter: -1,
  radiusJitter: Number.NEGATIVE_INFINITY,
});
const hardenedBounds = getTimelineCircleBounds(hardenedLayout);

assert.ok(Number.isFinite(bounds.minX), 'bounds minX must be finite');
assert.ok(Number.isFinite(bounds.maxX), 'bounds maxX must be finite');
assert.ok(Number.isFinite(bounds.minY), 'bounds minY must be finite');
assert.ok(Number.isFinite(bounds.maxY), 'bounds maxY must be finite');
assert.ok(bounds.width > 0, 'bounds width must be positive');
assert.ok(bounds.height > 0, 'bounds height must be positive');
assert.ok(bounds.minX <= bounds.maxX, 'bounds x range must be valid');
assert.ok(bounds.minY <= bounds.maxY, 'bounds y range must be valid');
assert.equal(bounds.width, bounds.maxX - bounds.minX, 'bounds width must match rounded x extents');
assert.equal(bounds.height, bounds.maxY - bounds.minY, 'bounds height must match rounded y extents');

assert.deepEqual(getTimelineCircleBounds([]), {
  minX: 0,
  maxX: 0,
  minY: 0,
  maxY: 0,
  width: 0,
  height: 0,
});

for (const node of hardenedLayout) {
  assert.ok(Number.isFinite(node.x), 'hardened node x must be finite');
  assert.ok(Number.isFinite(node.y), 'hardened node y must be finite');
  assert.ok(Number.isFinite(node.radius), 'hardened node radius must be finite');
  assert.ok(Number.isFinite(node.angle), 'hardened node angle must be finite');
  assert.ok(Number.isFinite(node.size), 'hardened node size must be finite');
  assert.ok(node.size > 0, 'hardened node size must remain visible');
}

assert.ok(Number.isFinite(hardenedBounds.width), 'hardened bounds width must be finite');
assert.ok(Number.isFinite(hardenedBounds.height), 'hardened bounds height must be finite');

const timelineCircleView = readProjectFile('src/components/timeline/TimelineCircleView.tsx');
const timelineStyles = readProjectFile('src/index.css');
const bottomSheet = readProjectFile('src/components/ui/BottomSheet.tsx');
const pointerDownBody = functionBody(timelineCircleView, 'handlePointerDown');
const pointerMoveBody = functionBody(timelineCircleView, 'handlePointerMove');
const pointerUpBody = functionBody(timelineCircleView, 'handlePointerUp');

assert.doesNotMatch(
  timelineCircleView,
  /timeline-circle-fallback[\s\S]{0,240}<ImageIcon/,
  'no-image timeline bubbles should render the emoji fallback, not the generic image icon',
);
assert.match(
  timelineCircleView,
  /className="timeline-circle-fallback-emoji"/,
  'emoji fallback should have a dedicated class so it can render as the primary bubble symbol',
);
assert.match(
  timelineStyles,
  /\.timeline-circle-fallback-emoji\b/,
  'emoji fallback should have dedicated styling',
);
assert.match(
  timelineStyles,
  /\.page-timeline\.timeline-circle-mode\s*\{[\s\S]*overflow:\s*hidden/,
  'timeline circle mode should keep the full-bleed stage inside the app viewport instead of page-scrolling under the bottom nav',
);
assert.match(
  timelineStyles,
  /\.page-timeline\.timeline-circle-mode\s*\{[\s\S]*padding-bottom:\s*calc\(\s*var\(--bottom-nav-page-padding[^)]*\)\s*\+\s*var\(--timeline-circle-nav-gap/,
  'timeline circle mode should reserve the real bottom navigation height plus a small visual gap',
);
assert.match(
  timelineStyles,
  /\.timeline-circle-shell\s*\{[\s\S]*flex:\s*1\s+1\s+auto[\s\S]*width:\s*100%[\s\S]*min-height:\s*0/,
  'timeline circle shell should stretch full-width through the remaining viewport instead of being a constrained card',
);
assert.doesNotMatch(
  timelineStyles,
  /\.timeline-circle-shell\s*\{[\s\S]*width:\s*min\(\s*100%\s*-\s*\(var\(--space-page-x\)/,
  'timeline circle shell should not be capped to the old narrow card width',
);
assert.match(
  timelineStyles,
  /\.timeline-circle-stage\s*\{[\s\S]*height:\s*100%/,
  'timeline circle stage should fill the shell height instead of using fixed viewport estimates',
);
assert.doesNotMatch(
  timelineStyles,
  /\.timeline-circle-stage\s*\{[\s\S]*height:\s*clamp\(/,
  'timeline circle stage should not be clamped to a card-like rectangle in circle mode',
);
assert.match(
  timelineStyles,
  /\.timeline-circle-stage\s*\{[\s\S]*border-radius:\s*0[\s\S]*box-shadow:\s*none/,
  'timeline circle stage should drop the visible card frame for the full-screen circle experience',
);
assert.match(
  timelineStyles,
  /\.timeline-circle-hints\s*\{[\s\S]*bottom:\s*var\(--timeline-circle-hint-bottom/,
  'timeline circle hints should sit within the nav-safe stage instead of using the device safe-area directly',
);
assert.match(
  timelineCircleView,
  /data-timeline-pin-id=\{pin\.id\}/,
  'timeline bubbles must expose their pin id for pointer-captured tap handling',
);
assert.match(
  pointerDownBody,
  /closest\(["']\.timeline-circle-load-more["']\)/,
  'load-more clicks should not be captured as drag gestures',
);
assert.match(
  pointerDownBody,
  /closest<[^>]+>\(["']\.timeline-circle-bubble["']\)/,
  'pointer gestures should remember which bubble started a tap',
);
assert.match(
  pointerDownBody,
  /event\.preventDefault\(\)/,
  'pin bubble pointer taps should cancel the follow-up compatibility click',
);
assert.match(
  pointerMoveBody,
  /movement\s*<=\s*TAP_DRAG_THRESHOLD[\s\S]{0,80}return/,
  'single-pointer jitter below the drag threshold should not pan or trigger load-more',
);
assert.match(
  pointerUpBody,
  /openPinDetail\(pin\)/,
  'pointer-captured taps should open the pin detail on pointerup',
);
assert.doesNotMatch(
  bottomSheet,
  /sheet-backdrop[\s\S]{0,120}onClick=\{onClose\}/,
  'bottom sheet should not close from the follow-up click that can fire after pointerup opens it',
);
assert.match(
  bottomSheet,
  /onPointerDown=\{[^}]*handleBackdropPointerDown[^}]*\}/,
  'bottom sheet backdrop should close from an intentional pointerdown after it is open',
);
assert.match(
  bottomSheet,
  /onPointerUp=\{[^}]*handleBackdropPointerUp[^}]*\}/,
  'bottom sheet backdrop should wait until pointerup before closing so the gesture cannot click through to timeline items',
);
assert.match(
  bottomSheet,
  /event\.preventDefault\(\)/,
  'bottom sheet backdrop pointer gestures should cancel follow-up compatibility clicks',
);
assert.match(
  bottomSheet,
  /event\.stopPropagation\(\)/,
  'bottom sheet backdrop pointer gestures should not bubble into underlying interactive UI',
);
assert.doesNotMatch(
  bottomSheet,
  /function handleBackdropPointerDown[\s\S]{0,220}onClose\(\)/,
  'bottom sheet must not unmount on pointerdown because that allows the remaining tap to hit an item behind it',
);
assert.match(
  bottomSheet,
  /function installBackdropClickGuard/,
  'bottom sheet should install a one-shot native click guard before closing from the backdrop',
);
assert.match(
  bottomSheet,
  /document\.addEventListener\(["']click["'][\s\S]{0,160}true\)/,
  'bottom sheet backdrop click guard should run in capture phase before underlying timeline item clicks',
);
assert.match(
  bottomSheet,
  /mousedown[\s\S]{0,80}mouseup[\s\S]{0,80}click[\s\S]{0,80}touchstart[\s\S]{0,80}touchend/,
  'bottom sheet backdrop guard should block the full synthetic press sequence, not only click',
);
assert.match(
  bottomSheet,
  /classList\.add\(["']bottom-sheet-click-guard["']\)/,
  'bottom sheet backdrop guard should temporarily disable underlying press animations',
);
assert.match(
  bottomSheet,
  /stopImmediatePropagation\(\)/,
  'bottom sheet backdrop click guard should stop the retargeted compatibility click immediately',
);
assert.match(
  readProjectFile('src/index.css'),
  /\.bottom-sheet-click-guard[\s\S]{0,220}\.timeline-card:has\(\.timeline-card-open:active\)/,
  'bottom sheet click guard should suppress timeline card active transform while swallowing the retargeted press',
);
