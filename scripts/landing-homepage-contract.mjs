import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const landingPage = readFileSync(resolve("src/pages/LandingPage.tsx"), "utf8");
const landingMap = readFileSync(
  resolve("src/components/landing/LandingMapScene.tsx"),
  "utf8",
);
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

assert.match(
  landingPage,
  /LandingMapScene/,
  "Landing hero should use the live map scene.",
);
assert.match(
  landingMap,
  /da-nang-journey-map\.jpg[\s\S]*fetchPriority="high"/,
  "Landing hero should prioritize the selected journey map artwork.",
);
assert.match(
  landingPage,
  /rooftop-da-nang\.jpg[\s\S]*my-khe-morning\.jpg[\s\S]*hoi-an-family\.jpg/,
  "Landing hero should use the selected real memory imagery.",
);
assert.match(
  landingPage,
  /privacyMode[\s\S]*aria-pressed/,
  "The featured memory privacy control should be interactive and accessible.",
);
assert.match(
  landingPage,
  /installPlatform[\s\S]*role="tab"[\s\S]*aria-selected/,
  "Installation instructions should keep functional platform tabs.",
);
assert.match(
  landingPage,
  /Compass[\s\S]*Share[\s\S]*SquarePlus[\s\S]*ChromeMark[\s\S]*EllipsisVertical[\s\S]*Smartphone/,
  "Installation instructions should retain the platform-specific icon set.",
);
assert.match(
  landingPage,
  /lp-circle-item-icon[\s\S]*LockKeyhole[\s\S]*lp-circle-item-icon[\s\S]*Share2[\s\S]*lp-circle-item-icon[\s\S]*UsersRound/,
  "Circle captions should use a consistent icon container.",
);
assert.match(
  landingPage,
  /lp-featured-inner[\s\S]*lp-circles-inner[\s\S]*lp-install-inner[\s\S]*lp-bottom-cta-inner/,
  "Landing sections should use constrained inner layouts for consistent rhythm.",
);
assert.doesNotMatch(
  landingPage,
  /lp-space-showcase|lp-memory-map-stage|map-preview\.png/,
  "The old card-heavy fake map showcase should be removed.",
);

for (const asset of [
  "public/landing/da-nang-journey-map.jpg",
  "public/landing/rooftop-da-nang.jpg",
  "public/landing/rooftop-da-nang-feature.jpg",
  "public/landing/my-khe-morning.jpg",
  "public/landing/hoi-an-family.jpg",
]) {
  assert.ok(existsSync(resolve(asset)), `Missing landing image: ${asset}`);
}

assert.match(
  landingCss,
  /\.lp-hero[\s\S]*height:\s*760px/,
  "The first viewport should reveal the beginning of the next memory section.",
);
assert.match(
  landingCss,
  /@keyframes lp-map-settle[\s\S]*@keyframes lp-photo-arrive/,
  "The map-led hero should include restrained first-load motion.",
);
assert.match(
  landingCss,
  /@keyframes lp-photo-float[\s\S]*@keyframes lp-step-enter/,
  "Landing motion should include ambient memories and staged install steps.",
);
assert.match(
  landingCss,
  /\.lp-featured-media[\s\S]*border-radius:\s*160px 24px 160px 24px[\s\S]*\.lp-circle-item:nth-child\(1\) img[\s\S]*border-radius:\s*200px 200px 28px 28px/,
  "Story imagery should use an editorial mix of asymmetric and arched shapes.",
);
assert.match(
  landingCss,
  /\.lp-install-steps::before[\s\S]*\.lp-install-step-icon[\s\S]*border-radius:\s*50%/,
  "Install instructions should use a lightweight timeline instead of stacked cards.",
);
assert.match(
  landingCss,
  /@media \(max-width:\s*560px\)[\s\S]*\.lp-hero-actions\s*{[\s\S]*flex-direction:\s*column;[\s\S]*align-items:\s*flex-start;/,
  "Mobile hero actions should stack instead of overflowing the viewport.",
);
assert.match(
  landingCss,
  /prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none\s*!important/,
  "Landing animations should respect reduced-motion preferences.",
);
assert.match(
  landingCss,
  /font-family:\s*"DM Sans",\s*"Be Vietnam Pro"[\s\S]*font-optical-sizing:\s*auto/,
  "Landing typography should use the softer DM Sans family with a Vietnamese-safe fallback.",
);
assert.match(
  indexHtml,
  /family=DM\+Sans:opsz,wght@9\.\.40,400/,
  "The landing font should be loaded from the existing Google Fonts connection.",
);
assert.match(
  landingCss,
  /\.lp \[data-reveal\]\s*{[\s\S]*?opacity:\s*1;[\s\S]*?\.lp \[data-reveal\] > \*\s*{[\s\S]*?opacity:\s*0;/,
  "Reveal motion should animate section content without hiding the section background.",
);

assert.match(enLanding, /Memories come alive/);
assert.match(enLanding, /in every place\./);
assert.match(enLanding, /Pin private moments/);
assert.match(viLanding, /Mỗi nơi chốn,/);
assert.match(viLanding, /một câu chuyện để nhớ\./);
assert.match(
  viLanding,
  /Lưu những khoảnh khắc của riêng bạn, hoặc cùng người thân và bạn bè vun đầy một bản đồ chung\./,
);
assert.match(viLanding, /Giữ riêng cho mình, hay cùng nhau lưu lại\./);
assert.match(viLanding, /Chạm biểu tượng Chia sẻ ở thanh công cụ/);
assert.doesNotMatch(
  viLanding,
  /bất kỳ ai|chỉ-mời|câu chuyện của nó|mọi vòng tròn nhỏ|Ít lộn xộn hơn|Luôn ở bên bạn|Bấm nút|Bấm menu|Home Screen|nhận push/,
  "Vietnamese landing copy should avoid literal or awkward phrasing.",
);

assert.match(
  indexHtml,
  /bản đồ kỷ niệm|private memory map/i,
  "SEO fallback metadata should match the memory-map positioning.",
);
