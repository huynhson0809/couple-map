import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const PRIMARY_ORIGIN = "https://pinly.tech";
const OLD_ORIGIN_PATTERN = /pinly-app\.vercel\.app/i;

const indexHtml = readFileSync(resolve("index.html"), "utf8");
const robots = readFileSync(resolve("public/robots.txt"), "utf8");
const sitemap = readFileSync(resolve("public/sitemap.xml"), "utf8");
const prerender = readFileSync(
  resolve("scripts/prerender-public-pages.mjs"),
  "utf8",
);
const generator = readFileSync(
  resolve("scripts/generate-search-files.mjs"),
  "utf8",
);
const vercel = readFileSync(resolve("vercel.json"), "utf8");

const EXPECTED_PUBLIC_PATHS = [
  "/",
  "/about",
  "/features",
  "/pricing",
  "/faq",
  "/guides/memory-map",
  "/guides/travel-memory-journal",
  "/privacy",
  "/terms",
];
const EXPECTED_LOCALIZED_PATHS = EXPECTED_PUBLIC_PATHS.flatMap((path) => [
  path,
  path === "/" ? "/vi" : `/vi${path}`,
]);
const PRIVATE_PATHS = [
  "/admin/",
  "/forgot-password",
  "/login",
  "/memory/",
  "/notifications",
  "/register",
  "/replay",
  "/reset-password",
  "/settings",
  "/setup",
  "/timeline",
  "/wishlist",
];

assert.match(
  indexHtml,
  /<html lang="en">/,
  "English must be the default language exposed to search crawlers.",
);
assert.match(
  indexHtml,
  /<title>Pinly - A Private Map for Your Memories<\/title>/,
  "The static homepage title must be English.",
);
assert.match(
  indexHtml,
  /<meta property="og:locale" content="en_US" \/>/,
  "English must be the primary Open Graph locale.",
);
assert.match(
  prerender,
  /const LANGUAGES = \["en", "vi"\];/,
  "Public prerendering must emit distinct English and Vietnamese pages.",
);

assert.doesNotMatch(
  `${indexHtml}\n${robots}\n${sitemap}`,
  OLD_ORIGIN_PATTERN,
  "Public SEO files must not reference the old Vercel preview domain.",
);

assert.match(
  indexHtml,
  new RegExp(`<link rel="canonical" href="${PRIMARY_ORIGIN}/"\\s*/>`),
  "Homepage canonical must point to the primary Pinly domain.",
);
assert.match(
  indexHtml,
  new RegExp(`<meta property="og:url" content="${PRIMARY_ORIGIN}/"\\s*/>`),
  "Open Graph URL must point to the primary Pinly domain.",
);
assert.match(
  indexHtml,
  new RegExp(`<meta property="og:image" content="${PRIMARY_ORIGIN}/landing/da-nang-journey-map\\.jpg"\\s*/>`),
  "Open Graph image must use the primary Pinly domain.",
);
assert.match(
  indexHtml,
  new RegExp(`<meta name="twitter:image" content="${PRIMARY_ORIGIN}/landing/da-nang-journey-map\\.jpg"\\s*/>`),
  "Twitter image must use the primary Pinly domain.",
);
assert.match(
  indexHtml,
  /"@type": "WebApplication"[\s\S]*"url": "https:\/\/pinly\.tech\/"/,
  "WebApplication JSON-LD URL must use the primary Pinly domain.",
);

assert.match(
  robots,
  new RegExp(`Sitemap: ${PRIMARY_ORIGIN}/sitemap\\.xml`),
  "robots.txt must advertise the primary-domain sitemap.",
);
assert.match(
  robots,
  /^User-agent: OAI-SearchBot$/m,
  "ChatGPT search crawling must be explicitly allowed.",
);

for (const path of PRIVATE_PATHS) {
  assert.match(
    robots,
    new RegExp(`^Disallow: ${path.replaceAll("/", "\\/")}$`, "m"),
    `${path} must be excluded from crawler discovery.`,
  );
}

const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (match) => match[1],
);
assert.deepEqual(
  sitemapUrls,
  EXPECTED_LOCALIZED_PATHS.map(
    (path) => `${PRIMARY_ORIGIN}${path === "/" ? "/" : path}`,
  ),
  "Sitemap must contain every English and Vietnamese public route exactly once.",
);
assert.match(
  sitemap,
  /^<\?xml version="1\.0" encoding="UTF-8"\?>/,
  "Sitemap must be a valid XML document.",
);
assert.match(
  sitemap,
  /<\?xml-stylesheet type="text\/xsl" href="\/sitemap\.xsl"\?>/,
  "Sitemap must provide a human-readable browser stylesheet.",
);
assert.match(
  sitemap,
  /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/,
  "Localized sitemap entries must declare the XHTML namespace.",
);
assert.match(
  sitemap,
  /xhtml:link rel="alternate" hreflang="en" href="https:\/\/pinly\.tech\/about"/,
  "Sitemap must connect English public pages to their language variants.",
);
assert.match(
  sitemap,
  /xhtml:link rel="alternate" hreflang="vi" href="https:\/\/pinly\.tech\/vi\/about"/,
  "Sitemap must expose the Vietnamese public-page variants.",
);
assert.match(
  sitemap,
  /xhtml:link rel="alternate" hreflang="x-default" href="https:\/\/pinly\.tech\/about"/,
  "Every language cluster must provide an English x-default URL.",
);
assert.doesNotMatch(
  sitemap,
  /<(?:lastmod|changefreq|priority)>/,
  "Sitemap must not publish fabricated dates or ignored ranking hints.",
);
assert.match(
  generator,
  /Object\.values\(PUBLIC_PAGES\)\.map/,
  "Sitemap generation must derive marketing routes from public page definitions.",
);
assert.match(
  vercel,
  /"source": "\/sitemap\.xml", "destination": "\/_seo\/sitemap\.xml"/,
  "Vercel must route sitemap.xml to an explicit static XML target.",
);
assert.match(
  vercel,
  /"source": "\/robots\.txt", "destination": "\/_seo\/robots\.txt"/,
  "Vercel must route robots.txt to an explicit static text target.",
);
assert.match(
  vercel,
  /"source": "\/vi\/about", "destination": "\/vi\/about\/index\.html"/,
  "Vercel must serve the prerendered Vietnamese route before the SPA fallback.",
);

assert.match(
  sitemap,
  new RegExp(`<loc>${PRIMARY_ORIGIN}/</loc>`),
  "Sitemap must include the public homepage on the primary domain.",
);
assert.doesNotMatch(
  sitemap,
  /<loc>https:\/\/pinly\.tech\/(?:login|register)<\/loc>/,
  "Sitemap must not include login or register routes.",
);
