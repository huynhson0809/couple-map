import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const landingPage = readFileSync(resolve("src/pages/LandingPage.tsx"), "utf8");
const landingCss = readFileSync(resolve("src/pages/LandingPage.css"), "utf8");
const i18n = readFileSync(resolve("src/hooks/I18nContext.tsx"), "utf8");
const indexHtml = readFileSync(resolve("index.html"), "utf8");

function landingBlock(localeAnchor, fromIndex = 0) {
  const start = i18n.indexOf(localeAnchor, fromIndex);
  assert.ok(start >= 0, `Missing locale anchor: ${localeAnchor}`);
  const end = i18n.indexOf('"desktop.title"', start);
  assert.ok(end > start, `Could not isolate landing block for ${localeAnchor}`);
  return i18n.slice(start, end);
}

const enLanding = landingBlock('"landing.heroTitle":');
const viLanding = landingBlock(
  '"landing.heroTitle":',
  i18n.indexOf('"landing.heroTitle":') + 1,
);

assert.doesNotMatch(
  i18n,
  /"landing\.proofCouples"/,
  "Landing copy should not keep the old couple-oriented proof key.",
);
assert.match(
  landingPage,
  /landing\.proofSpaces/,
  "Landing page should use a spaces-oriented proof key.",
);
assert.match(
  landingPage,
  /lp-space-showcase/,
  "Landing hero should include a spaces-first visual showcase.",
);
assert.match(
  landingPage,
  /landing\.spacePersonal[\s\S]*landing\.spaceTrip[\s\S]*landing\.spaceFamily[\s\S]*landing\.spaceFriends/,
  "Landing hero should show multiple memory space examples.",
);
assert.match(
  landingCss,
  /\.lp-space-showcase/,
  "Landing CSS should style the spaces-first hero showcase.",
);
assert.match(
  landingCss,
  /\.lp-memory-map/,
  "Landing CSS should preserve a map preview inside the spaces-first hero.",
);
assert.match(
  landingPage,
  /lp-memory-map-stage/,
  "Landing hero should wrap the map in a vertical stage so the full image can be seen.",
);
assert.match(
  landingCss,
  /\.lp-memory-map-stage[\s\S]*aspect-ratio:\s*9\s*\/\s*16/,
  "Landing map preview should use a tall phone-like portrait frame.",
);
assert.match(
  landingCss,
  /\.lp-memory-map-img[\s\S]*object-fit:\s*contain/,
  "Landing map image should be contained instead of cropped.",
);
assert.match(
  landingCss,
  /@keyframes lp-hero-reveal[\s\S]*@keyframes lp-map-scan[\s\S]*@keyframes lp-pin-pop/,
  "Landing page should include first-load reveal and map motion keyframes.",
);
assert.match(
  landingCss,
  /prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none/,
  "Landing animations should respect reduced-motion preferences.",
);

assert.match(enLanding, /Memory spaces for every moment\./);
assert.match(enLanding, /Private or shared\./);
assert.match(enLanding, /Personal & shared spaces/i);
assert.match(viLanding, /Không gian cho mọi kỷ niệm\./);
assert.match(viLanding, /Riêng tư hoặc chia sẻ\./);
assert.match(viLanding, /Không gian riêng & chung/i);
assert.doesNotMatch(
  viLanding,
  /nơi chốn|bất kỳ ai|chỉ-mời|câu chuyện của nó/,
  "Vietnamese landing copy should avoid literal or awkward phrasing.",
);

assert.match(
  indexHtml,
  /không gian riêng|personal and shared memory spaces/i,
  "SEO fallback metadata should match the new spaces-first positioning.",
);
