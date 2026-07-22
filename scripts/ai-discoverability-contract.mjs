import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(path), "utf8");

const indexHtml = read("index.html");
const robots = read("public/robots.txt");
const sitemap = read("public/sitemap.xml");
const llms = read("public/llms.txt");
const llmsFull = read("public/llms-full.txt");
const publicPages = read("src/content/publicPages.ts");
const publicPageComponent = read("src/pages/PublicContentPage.tsx");
const landingPage = read("src/pages/LandingPage.tsx");
const prerender = read("scripts/prerender-public-pages.mjs");
const vercel = read("vercel.json");
const packageJson = read("package.json");

const publicPaths = [
  "/about",
  "/features",
  "/pricing",
  "/faq",
  "/guides/memory-map",
  "/guides/travel-memory-journal",
];

assert.match(
  robots,
  /User-agent:\s*\*[\s\S]*?Allow:\s*\//,
  "Public crawlers, including OAI-SearchBot, must be allowed by robots.txt.",
);
assert.match(
  robots,
  /User-agent:\s*OAI-SearchBot[\s\S]*?Allow:\s*\//,
  "OpenAI search crawling must be explicitly allowed.",
);
assert.doesNotMatch(
  robots,
  /Disallow:\s*\/(?:about|features|pricing|faq|guides)/,
  "Public knowledge pages must remain crawlable.",
);

for (const path of publicPaths) {
  assert.match(
    sitemap,
    new RegExp(`<loc>https://pinly\\.tech${path}</loc>`),
    `${path} must be present in sitemap.xml.`,
  );
  assert.match(
    vercel,
    new RegExp(`"source": "${path.replaceAll("/", "\\/")}"`),
    `${path} must have a prerender rewrite before the SPA fallback.`,
  );
  assert.match(
    llms,
    new RegExp(`https://pinly\\.tech${path}`),
    `${path} must be discoverable from llms.txt.`,
  );
  assert.match(
    sitemap,
    new RegExp(`<loc>https://pinly\\.tech/vi${path}</loc>`),
    `The Vietnamese ${path} route must be present in sitemap.xml.`,
  );
  assert.match(
    vercel,
    new RegExp(`"source": "/vi${path.replaceAll("/", "\\/")}"`),
    `The Vietnamese ${path} route must have a prerender rewrite.`,
  );
  assert.match(
    llms,
    new RegExp(`https://pinly\\.tech/vi${path}`),
    `The Vietnamese ${path} route must be discoverable from llms.txt.`,
  );
}

assert.match(
  llms,
  /llms-full\.txt/,
  "llms.txt must reference the full version (llms-full.txt).",
);
for (const path of publicPaths) {
  assert.match(
    llmsFull,
    new RegExp(`https://pinly\\.tech${path}`),
    `${path} must be discoverable from llms-full.txt.`,
  );
}

assert.match(
  indexHtml,
  /<link rel="alternate" hreflang="vi" href="https:\/\/pinly\.tech\/vi" \/>/,
  "The default homepage must link to its distinct Vietnamese version.",
);
assert.match(
  prerender,
  /replaceAlternate[\s\S]*"x-default"/,
  "Prerendered public pages must emit reciprocal locale alternates.",
);
assert.match(
  sitemap,
  /xhtml:link rel="alternate" hreflang="vi" href="https:\/\/pinly\.tech\/vi\/about"/,
  "Sitemap locale annotations must point to distinct crawlable locale URLs.",
);
assert.match(
  indexHtml,
  /<html lang="en">/,
  "The crawlable default version must remain English.",
);

assert.match(
  indexHtml,
  /"alternateName": \["Pinly Memory Map", "Pinly Private Memory Map"/,
  "Entity schema must distinguish Pinly from similarly named products.",
);
assert.doesNotMatch(
  indexHtml,
  /"@type": "FAQPage"/,
  "FAQ schema must live on the visible public FAQ page, not globally.",
);
assert.doesNotMatch(
  `${indexHtml}\n${llms}\n${llmsFull}\n${publicPages}`,
  /(?:100 pins|100 kỷ niệm)/i,
  "Public AI-facing content must not advertise the old Free limit.",
);

for (const expectedLimit of ["50 kỷ niệm", "300 kỷ niệm", "500 kỷ niệm"]) {
  assert.match(
    publicPages,
    new RegExp(expectedLimit),
    `Public content must include ${expectedLimit}.`,
  );
}

assert.match(
  publicPageComponent,
  /<details key=\{item\.question\}/,
  "FAQ answers must be visible in the rendered page.",
);
assert.match(
  publicPageComponent,
  /usePublicPageSeo\(pageKey, lang\)/,
  "Every public content route must publish route-specific metadata and schema.",
);
assert.match(
  landingPage,
  /PUBLIC_INFO_PAGE_KEYS\.map/,
  "The homepage must internally link to public knowledge pages.",
);
assert.match(
  prerender,
  /writeLocalizedPage\(page\.path, language, buildPageHtml\(page, language\)\)/,
  "Build-time prerender must emit static HTML for each localized public route.",
);
assert.match(
  packageJson,
  /vite build && node --experimental-strip-types scripts\/prerender-public-pages\.mjs/,
  "Production builds must run public-page prerendering.",
);

console.log("AI discoverability contract passed.");
