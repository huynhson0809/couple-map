import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const PRIMARY_ORIGIN = "https://pinly.tech";
const OLD_ORIGIN_PATTERN = /pinly-app\.vercel\.app/i;

const indexHtml = readFileSync(resolve("index.html"), "utf8");
const robots = readFileSync(resolve("public/robots.txt"), "utf8");
const sitemap = readFileSync(resolve("public/sitemap.xml"), "utf8");

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
  new RegExp(`<meta property="og:image" content="${PRIMARY_ORIGIN}/icons/icon-512\\.png"\\s*/>`),
  "Open Graph image must use the primary Pinly domain.",
);
assert.match(
  indexHtml,
  new RegExp(`<meta name="twitter:image" content="${PRIMARY_ORIGIN}/icons/icon-512\\.png"\\s*/>`),
  "Twitter image must use the primary Pinly domain.",
);
assert.match(
  indexHtml,
  /"@type": "WebApplication"[\s\S]*"url": "https:\/\/pinly\.tech"/,
  "WebApplication JSON-LD URL must use the primary Pinly domain.",
);

assert.match(
  robots,
  new RegExp(`Sitemap: ${PRIMARY_ORIGIN}/sitemap\\.xml`),
  "robots.txt must advertise the primary-domain sitemap.",
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
