import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  PUBLIC_INFO_PAGE_KEYS,
  PUBLIC_PAGES,
  getPublicPageSchema,
} from "../src/content/publicPages.ts";

const DIST_DIR = resolve("dist");
const template = readFileSync(resolve(DIST_DIR, "index.html"), "utf8");
const language = "en";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceMeta(html, attribute, key, value) {
  const pattern = new RegExp(
    `<meta ${attribute}="${escapeRegExp(key)}" content="[^"]*" \\/>`,
  );
  const replacement = `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`;
  return html.replace(pattern, replacement);
}

function renderSections(sections) {
  return sections
    .map(
      (section) => `
        <section class="pinly-static-section">
          <h2>${escapeHtml(section.title)}</h2>
          <div>
            ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
            ${
              section.bullets
                ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
                : ""
            }
          </div>
        </section>`,
    )
    .join("");
}

function renderPlans(plans) {
  if (!plans) return "";
  return `
    <section class="pinly-static-plans" aria-label="Pinly pricing">
      ${plans
        .map(
          (plan) => `
            <article>
              <h2>${escapeHtml(plan.name)}</h2>
              <strong>${escapeHtml(plan.monthlyPrice)}</strong>
              <small>${escapeHtml(plan.annualPrice)}</small>
              <p>${escapeHtml(plan.description)}</p>
              <ul>${plan.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>
            </article>`,
        )
        .join("")}
    </section>`;
}

function renderSteps(steps) {
  if (!steps) return "";
  return `
    <section class="pinly-static-steps">
      <h2>How it works</h2>
      <ol>
        ${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
    </section>`;
}

function renderQuestions(questions) {
  if (!questions) return "";
  return `
    <section class="pinly-static-faq">
      <h2>Frequently asked questions</h2>
      ${questions
        .map(
          (item) => `
            <article>
              <h3>${escapeHtml(item.question)}</h3>
              <p>${escapeHtml(item.answer)}</p>
            </article>`,
        )
        .join("")}
    </section>`;
}

function renderStaticPage(page) {
  const content = page[language];
  const links = PUBLIC_INFO_PAGE_KEYS.map((key) => {
    const linkedPage = PUBLIC_PAGES[key];
    return `<a href="${linkedPage.path}">${escapeHtml(linkedPage[language].eyebrow)}</a>`;
  }).join("");

  return `
    <div id="pinly-prerender" class="pinly-prerender">
      <header class="pinly-static-nav">
        <a class="pinly-static-brand" href="/">
          <img src="/favicon.svg" width="30" height="30" alt="" />
          <span>Pinly</span>
        </a>
        <nav aria-label="Pinly information navigation">${links}</nav>
        <a class="pinly-static-cta" href="/register">Start for free</a>
      </header>
      <main>
        <section class="pinly-static-hero">
          <img src="${page.image}" alt="" />
          <div>
            <span>${escapeHtml(content.eyebrow)}</span>
            <h1>${escapeHtml(content.title)}</h1>
            <p>${escapeHtml(content.description)}</p>
          </div>
        </section>
        ${renderPlans(content.plans)}
        ${renderSteps(content.steps)}
        ${renderSections(content.sections)}
        ${renderQuestions(content.questions)}
        <section class="pinly-static-bottom">
          <h2>${escapeHtml(content.ctaTitle)}</h2>
          <p>${escapeHtml(content.ctaDescription)}</p>
          <a class="pinly-static-cta" href="/register">Create a Pinly account</a>
        </section>
      </main>
      <footer>
        <strong>Pinly</strong>
        <nav>${links}<a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
        <small>© 2026 Pinly</small>
      </footer>
    </div>`;
}

const fallbackStyles = `
  <style id="pinly-prerender-styles">
    .pinly-prerender{min-height:100vh;color:#15171e;background:#fff;font-family:"DM Sans","Be Vietnam Pro",sans-serif;line-height:1.6}.pinly-prerender *{box-sizing:border-box}.pinly-static-nav{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:28px;min-height:76px;padding:14px max(28px,calc((100vw - 1160px)/2));border-bottom:1px solid #dfe4e3}.pinly-static-brand{display:flex;align-items:center;color:#15171e;font-size:20px;font-weight:750;text-decoration:none}.pinly-static-nav nav,.pinly-prerender footer nav{display:flex;justify-content:center;flex-wrap:wrap;gap:12px 24px}.pinly-static-nav nav a,.pinly-prerender footer a{color:#15171e;font-size:14px;font-weight:650;text-decoration:none}.pinly-static-cta{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;color:#fff;background:#ff565c;border-radius:8px;font-weight:750;text-decoration:none}.pinly-static-hero{position:relative;display:flex;align-items:flex-end;min-height:500px;overflow:hidden}.pinly-static-hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.25}.pinly-static-hero>div{position:relative;width:min(1160px,calc(100% - 56px));margin:0 auto;padding:90px 0 82px}.pinly-static-hero span{color:#e9474e;font-size:14px;font-weight:800;text-transform:uppercase}.pinly-static-hero h1{max-width:820px;margin:18px 0;font-size:58px;line-height:1.05}.pinly-static-hero p{max-width:720px;margin:0;color:#3c424c;font-size:20px}.pinly-static-section,.pinly-static-steps,.pinly-static-faq,.pinly-static-bottom,.pinly-static-plans{width:min(1160px,calc(100% - 56px));margin:0 auto;padding:82px 0;border-bottom:1px solid #dfe4e3}.pinly-static-section{display:grid;grid-template-columns:.8fr 1.2fr;gap:80px}.pinly-static-section h2,.pinly-static-steps h2,.pinly-static-faq h2,.pinly-static-bottom h2{margin:0;font-size:34px;line-height:1.2}.pinly-static-section p,.pinly-static-faq p{color:#626975;font-size:17px}.pinly-static-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.pinly-static-plans article{padding:28px;border:1px solid #dfe4e3;border-radius:8px}.pinly-static-plans h2{margin:0}.pinly-static-plans strong,.pinly-static-plans small{display:block}.pinly-static-plans strong{margin-top:14px;font-size:25px}.pinly-static-steps ol{display:grid;gap:16px;padding-left:26px}.pinly-static-steps li{padding-left:10px;font-size:17px}.pinly-static-faq article{padding:22px 0;border-bottom:1px solid #dfe4e3}.pinly-static-faq h3{margin:0}.pinly-static-faq p{margin-bottom:0}.pinly-static-bottom p{color:#626975}.pinly-static-bottom .pinly-static-cta{margin-top:14px}.pinly-prerender footer{padding:44px max(28px,calc((100vw - 1160px)/2));color:#f4f5f8;background:#171a22}.pinly-prerender footer nav{justify-content:flex-start;margin:24px 0}.pinly-prerender footer a{color:#f4f5f8}.pinly-prerender footer small{color:#aeb4c0}@media(max-width:800px){.pinly-static-nav{grid-template-columns:auto auto}.pinly-static-nav nav{display:none}.pinly-static-hero h1{font-size:40px}.pinly-static-section{grid-template-columns:1fr;gap:24px}.pinly-static-plans{grid-template-columns:1fr}}@media(max-width:560px){.pinly-static-nav{padding:12px 18px}.pinly-static-cta{padding:0 12px;font-size:13px}.pinly-static-hero{min-height:440px}.pinly-static-hero>div,.pinly-static-section,.pinly-static-steps,.pinly-static-faq,.pinly-static-bottom,.pinly-static-plans{width:calc(100% - 40px)}.pinly-static-hero h1{font-size:34px}.pinly-static-hero p{font-size:17px}}
  </style>`;

function buildPageHtml(page) {
  const content = page[language];
  const canonicalUrl = `https://pinly.tech${page.path === "/" ? "/" : page.path}`;
  const imageUrl = `https://pinly.tech${page.image}`;
  let html = template;

  html = html.replace(/<html lang="[^"]+">/, `<html lang="${language}">`);
  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(content.metaTitle)}</title>`,
  );
  html = replaceMeta(html, "name", "description", content.metaDescription);
  html = replaceMeta(html, "property", "og:url", canonicalUrl);
  html = replaceMeta(html, "property", "og:title", content.metaTitle);
  html = replaceMeta(
    html,
    "property",
    "og:description",
    content.metaDescription,
  );
  html = replaceMeta(html, "property", "og:image", imageUrl);
  html = replaceMeta(html, "name", "twitter:title", content.metaTitle);
  html = replaceMeta(
    html,
    "name",
    "twitter:description",
    content.metaDescription,
  );
  html = replaceMeta(html, "name", "twitter:image", imageUrl);
  html = html.replace(
    /<link rel="canonical" href="[^"]+" \/>/,
    `<link rel="canonical" href="${canonicalUrl}" />\n    <link rel="alternate" hreflang="en" href="${canonicalUrl}" />\n    <link rel="alternate" hreflang="vi" href="${canonicalUrl}" />\n    <link rel="alternate" hreflang="x-default" href="${canonicalUrl}" />`,
  );
  html = html.replace(/<!-- noscript fallback:[\s\S]*?<\/noscript>/, "");

  const schema = JSON.stringify(getPublicPageSchema(page, language)).replace(
    /</g,
    "\\u003c",
  );
  html = html.replace(
    "</head>",
    `${fallbackStyles}<script id="pinly-route-schema" type="application/ld+json">${schema}</script></head>`,
  );
  html = html.replace(
    '<div id="root"></div>',
    `${renderStaticPage(page)}\n    <div id="root"></div>`,
  );

  return html;
}

for (const page of Object.values(PUBLIC_PAGES)) {
  const relativePath =
    page.path === "/" ? "index.html" : `${page.path.slice(1)}/index.html`;
  const outputPath = resolve(DIST_DIR, relativePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buildPageHtml(page));
}

console.log(
  `Prerendered ${Object.keys(PUBLIC_PAGES).length} public Pinly pages.`,
);
