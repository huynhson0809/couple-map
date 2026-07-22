import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PUBLIC_PAGES,
  PUBLIC_POLICY_PATHS,
  getLocalizedPublicPath,
} from "../src/content/publicPages.ts";

const PRIMARY_ORIGIN = "https://pinly.tech";
const PRIVATE_ROUTE_PREFIXES = [
  "/_seo/",
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

const publicBasePaths = [
  ...new Set([
    ...Object.values(PUBLIC_PAGES).map((page) => page.path),
    ...PUBLIC_POLICY_PATHS,
  ]),
];
const publicRoutePairs = publicBasePaths.map((basePath) => ({
  basePath,
  en: getLocalizedPublicPath(basePath, "en"),
  vi: getLocalizedPublicPath(basePath, "vi"),
}));

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function absoluteUrl(path) {
  return `${PRIMARY_ORIGIN}${path === "/" ? "/" : path}`;
}

function renderSitemap() {
  const urls = publicRoutePairs
    .flatMap((routes) => [routes.en, routes.vi].map((path) => ({ path, routes })))
    .map(
      ({ path, routes }) => `  <url>
    <loc>${escapeXml(absoluteUrl(path))}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(absoluteUrl(routes.en))}" />
    <xhtml:link rel="alternate" hreflang="vi" href="${escapeXml(absoluteUrl(routes.vi))}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(absoluteUrl(routes.en))}" />
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

function renderRobots() {
  const disallowRules = PRIVATE_ROUTE_PREFIXES.map(
    (path) => `Disallow: ${path}`,
  ).join("\n");
  const renderGroup = (userAgent) => `User-agent: ${userAgent}
Allow: /
${disallowRules}`;

  return `# Public Pinly pages may be crawled by search and AI discovery bots.
# Private routes are excluded from discovery; robots.txt is not access control.
${renderGroup("OAI-SearchBot")}

${renderGroup("ChatGPT-User")}

${renderGroup("*")}

Sitemap: ${PRIMARY_ORIGIN}/sitemap.xml
`;
}

const publicDir = resolve("public");
const shadowDir = resolve(publicDir, "_seo");
const sitemap = renderSitemap();
const robots = renderRobots();
const stylesheet = readFileSync(resolve(publicDir, "sitemap.xsl"), "utf8");

mkdirSync(shadowDir, { recursive: true });
writeFileSync(resolve(publicDir, "sitemap.xml"), sitemap);
writeFileSync(resolve(publicDir, "robots.txt"), robots);
writeFileSync(resolve(shadowDir, "sitemap.xml"), sitemap);
writeFileSync(resolve(shadowDir, "robots.txt"), robots);
writeFileSync(resolve(shadowDir, "sitemap.xsl"), stylesheet);

console.log(
  `Generated sitemap.xml and robots.txt for ${publicRoutePairs.length * 2} localized public routes.`,
);
