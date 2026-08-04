import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  PUBLIC_CHROME,
  PUBLIC_INFO_PAGE_KEYS,
  PUBLIC_PAGES,
  getLocalizedPublicPath,
  getPublicPageSchema,
} from "../src/content/publicPages.ts";
import {
  DEFAULT_CAREERS_EMAIL,
  createCareersMailto,
} from "../src/config/careers.ts";
import { resolvePublicSocialLinks } from "../src/config/publicSocialLinks.ts";
import { getLegalContent } from "../src/lib/legalContent.ts";

const DIST_DIR = resolve("dist");
const template = readFileSync(resolve(DIST_DIR, "index.html"), "utf8");
const LANGUAGES = ["en", "vi"];
const PRIMARY_ORIGIN = "https://pinly.tech";
const PUBLIC_SOCIAL_LINKS = resolvePublicSocialLinks({
  VITE_SOCIAL_LINKEDIN_URL: process.env.VITE_SOCIAL_LINKEDIN_URL,
  VITE_SOCIAL_FACEBOOK_URL: process.env.VITE_SOCIAL_FACEBOOK_URL,
  VITE_SOCIAL_INSTAGRAM_URL: process.env.VITE_SOCIAL_INSTAGRAM_URL,
  VITE_SOCIAL_THREADS_URL: process.env.VITE_SOCIAL_THREADS_URL,
  VITE_SOCIAL_TIKTOK_URL: process.env.VITE_SOCIAL_TIKTOK_URL,
  VITE_SOCIAL_X_URL: process.env.VITE_SOCIAL_X_URL,
});

const STATIC_LABELS = {
  en: {
    pricing: "Pinly pricing",
    steps: "How it works",
    questions: "Frequently asked questions",
    account: "Create a Pinly account",
    apply: "Start a conversation",
    privacy: "Privacy",
    terms: "Terms",
    legal: "Legal information",
    social: "Follow Pinly",
  },
  vi: {
    pricing: "Bảng giá Pinly",
    steps: "Cách thực hiện",
    questions: "Câu hỏi thường gặp",
    account: "Tạo tài khoản Pinly",
    apply: "Bắt đầu trao đổi",
    privacy: "Quyền riêng tư",
    terms: "Điều khoản",
    legal: "Thông tin pháp lý",
    social: "Theo dõi Pinly",
  },
};

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

function absolutePublicUrl(basePath, language) {
  return `${PRIMARY_ORIGIN}${getLocalizedPublicPath(basePath, language)}`;
}

function applyOrganizationSameAs(html) {
  return html.replace(
    /"sameAs":\s*\[[^\]]*\]/,
    `"sameAs": ${JSON.stringify(PUBLIC_SOCIAL_LINKS.map((link) => link.url))}`,
  );
}

function renderStaticSocialLinks(language) {
  if (PUBLIC_SOCIAL_LINKS.length === 0) return "";

  const links = PUBLIC_SOCIAL_LINKS.map(
    (link) =>
      `<a href="${escapeHtml(link.url)}" target="_blank" rel="me noopener noreferrer">${escapeHtml(link.label)}</a>`,
  ).join("");

  return `<nav class="pinly-static-social" aria-label="${STATIC_LABELS[language].social}">${links}</nav>`;
}

function replaceAlternate(html, hreflang, href) {
  const pattern = new RegExp(
    `<link rel="alternate" hreflang="${escapeRegExp(hreflang)}" href="[^"]+" \\/>`,
  );
  return html.replace(
    pattern,
    `<link rel="alternate" hreflang="${hreflang}" href="${href}" />`,
  );
}

function applyLanguageMetadata(html, basePath, language) {
  let localizedHtml = html;
  localizedHtml = localizedHtml.replace(
    /<html lang="[^"]+">/,
    `<html lang="${language}">`,
  );
  localizedHtml = replaceAlternate(
    localizedHtml,
    "en",
    absolutePublicUrl(basePath, "en"),
  );
  localizedHtml = replaceAlternate(
    localizedHtml,
    "vi",
    absolutePublicUrl(basePath, "vi"),
  );
  localizedHtml = replaceAlternate(
    localizedHtml,
    "x-default",
    absolutePublicUrl(basePath, "en"),
  );
  localizedHtml = replaceMeta(
    localizedHtml,
    "property",
    "og:locale",
    language === "vi" ? "vi_VN" : "en_US",
  );
  localizedHtml = replaceMeta(
    localizedHtml,
    "property",
    "og:locale:alternate",
    language === "vi" ? "en_US" : "vi_VN",
  );
  return localizedHtml;
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

function renderPlans(plans, language) {
  if (!plans) return "";
  return `
    <section class="pinly-static-plans" aria-label="${STATIC_LABELS[language].pricing}">
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

function renderSteps(steps, language) {
  if (!steps) return "";
  return `
    <section class="pinly-static-steps">
      <h2>${STATIC_LABELS[language].steps}</h2>
      <ol>
        ${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
    </section>`;
}

function renderQuestions(questions, language) {
  if (!questions) return "";
  return `
    <section class="pinly-static-faq">
      <h2>${STATIC_LABELS[language].questions}</h2>
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

function renderStaticPage(page, language) {
  const content = page[language];
  const chrome = PUBLIC_CHROME[language];
  const links = PUBLIC_INFO_PAGE_KEYS.map((key) => {
    const linkedPage = PUBLIC_PAGES[key];
    return `<a href="${getLocalizedPublicPath(linkedPage.path, language)}">${escapeHtml(linkedPage[language].eyebrow)}</a>`;
  }).join("");
  const homePath = getLocalizedPublicPath("/", language);
  const privacyPath = getLocalizedPublicPath("/privacy", language);
  const termsPath = getLocalizedPublicPath("/terms", language);
  const isCareersPage = page.key === "careers";
  const careersEmail = DEFAULT_CAREERS_EMAIL;
  const bottomCtaHref = isCareersPage
    ? createCareersMailto(careersEmail, language)
    : "/register";
  const bottomCtaLabel = isCareersPage
    ? STATIC_LABELS[language].apply
    : STATIC_LABELS[language].account;

  return `
    <div id="pinly-prerender" class="pinly-prerender">
      <header class="pinly-static-nav">
        <a class="pinly-static-brand" href="${homePath}">
          <img src="/favicon.svg" width="30" height="30" alt="" />
          <span>Pinly</span>
        </a>
        <nav aria-label="${escapeHtml(chrome.navLabel)}">${links}</nav>
        <a class="pinly-static-cta" href="/register">${escapeHtml(chrome.register)}</a>
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
        ${renderPlans(content.plans, language)}
        ${renderSteps(content.steps, language)}
        ${renderSections(content.sections)}
        ${renderQuestions(content.questions, language)}
        <section class="pinly-static-bottom">
          <h2>${escapeHtml(content.ctaTitle)}</h2>
          <p>${escapeHtml(content.ctaDescription)}</p>
          <a class="pinly-static-cta" href="${escapeHtml(bottomCtaHref)}">${bottomCtaLabel}</a>
        </section>
      </main>
      <footer>
        <strong>Pinly</strong>
        <nav>${links}<a href="${privacyPath}">${STATIC_LABELS[language].privacy}</a><a href="${termsPath}">${STATIC_LABELS[language].terms}</a></nav>
        ${renderStaticSocialLinks(language)}
        <small>© 2026 Pinly</small>
      </footer>
    </div>`;
}

function renderStaticPolicyPage(kind, language) {
  const content = getLegalContent(kind, language);
  const chrome = PUBLIC_CHROME[language];
  const links = PUBLIC_INFO_PAGE_KEYS.map((key) => {
    const linkedPage = PUBLIC_PAGES[key];
    return `<a href="${getLocalizedPublicPath(linkedPage.path, language)}">${escapeHtml(linkedPage[language].eyebrow)}</a>`;
  }).join("");
  const homePath = getLocalizedPublicPath("/", language);
  const privacyPath = getLocalizedPublicPath("/privacy", language);
  const termsPath = getLocalizedPublicPath("/terms", language);

  return `
    <div id="pinly-prerender" class="pinly-prerender">
      <header class="pinly-static-nav">
        <a class="pinly-static-brand" href="${homePath}">
          <img src="/favicon.svg" width="30" height="30" alt="" />
          <span>Pinly</span>
        </a>
        <nav aria-label="${escapeHtml(chrome.navLabel)}">${links}</nav>
        <a class="pinly-static-cta" href="/register">${escapeHtml(chrome.register)}</a>
      </header>
      <main>
        <section class="pinly-static-legal-hero">
          <span>${STATIC_LABELS[language].legal}</span>
          <h1>${escapeHtml(content.title)}</h1>
          <p>${escapeHtml(content.summary)}</p>
          <time>${escapeHtml(content.effectiveDate)}</time>
        </section>
        <article class="pinly-static-legal-body">
          ${content.sections
            .map(
              (section) => `
                <section class="pinly-static-section">
                  <h2>${escapeHtml(section.title)}</h2>
                  <div>${section.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>
                </section>`,
            )
            .join("")}
        </article>
      </main>
      <footer>
        <strong>Pinly</strong>
        <nav>${links}<a href="${privacyPath}">${STATIC_LABELS[language].privacy}</a><a href="${termsPath}">${STATIC_LABELS[language].terms}</a></nav>
        ${renderStaticSocialLinks(language)}
        <small>© 2026 Pinly</small>
      </footer>
    </div>`;
}

const fallbackStyles = `
  <style id="pinly-prerender-styles">
    .pinly-prerender{min-height:100vh;color:#15171e;background:#fff;font-family:"DM Sans","Be Vietnam Pro",sans-serif;line-height:1.6}.pinly-prerender *{box-sizing:border-box}.pinly-static-nav{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:28px;min-height:76px;padding:14px max(28px,calc((100vw - 1160px)/2));border-bottom:1px solid #dfe4e3}.pinly-static-brand{display:flex;align-items:center;color:#15171e;font-size:20px;font-weight:750;text-decoration:none}.pinly-static-nav nav,.pinly-prerender footer nav{display:flex;justify-content:center;flex-wrap:wrap;gap:12px 24px}.pinly-static-nav nav a,.pinly-prerender footer a{color:#15171e;font-size:14px;font-weight:650;text-decoration:none}.pinly-static-cta{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;color:#fff;background:#ff565c;border-radius:8px;font-weight:750;text-decoration:none}.pinly-static-hero{position:relative;display:flex;align-items:flex-end;min-height:500px;overflow:hidden}.pinly-static-hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.25}.pinly-static-hero>div{position:relative;width:min(1160px,calc(100% - 56px));margin:0 auto;padding:90px 0 82px}.pinly-static-hero span,.pinly-static-legal-hero>span{color:#e9474e;font-size:14px;font-weight:800;text-transform:uppercase}.pinly-static-hero h1{max-width:820px;margin:18px 0;font-size:58px;line-height:1.05}.pinly-static-hero p{max-width:720px;margin:0;color:#3c424c;font-size:20px}.pinly-static-section,.pinly-static-steps,.pinly-static-faq,.pinly-static-bottom,.pinly-static-plans{width:min(1160px,calc(100% - 56px));margin:0 auto;padding:82px 0;border-bottom:1px solid #dfe4e3}.pinly-static-section{display:grid;grid-template-columns:.8fr 1.2fr;gap:80px}.pinly-static-section h2,.pinly-static-steps h2,.pinly-static-faq h2,.pinly-static-bottom h2{margin:0;font-size:34px;line-height:1.2}.pinly-static-section p,.pinly-static-faq p{color:#626975;font-size:17px}.pinly-static-plans{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.pinly-static-plans article{padding:28px;border:1px solid #dfe4e3;border-radius:8px}.pinly-static-plans h2{margin:0}.pinly-static-plans strong,.pinly-static-plans small{display:block}.pinly-static-plans strong{margin-top:14px;font-size:25px}.pinly-static-steps ol{display:grid;gap:16px;padding-left:26px}.pinly-static-steps li{padding-left:10px;font-size:17px}.pinly-static-faq article{padding:22px 0;border-bottom:1px solid #dfe4e3}.pinly-static-faq h3{margin:0}.pinly-static-faq p{margin-bottom:0}.pinly-static-bottom p{color:#626975}.pinly-static-bottom .pinly-static-cta{margin-top:14px}.pinly-static-legal-hero{width:min(960px,calc(100% - 56px));margin:0 auto;padding:90px 0 58px}.pinly-static-legal-hero h1{max-width:800px;margin:16px 0;font-size:54px;line-height:1.08}.pinly-static-legal-hero p{max-width:780px;color:#626975;font-size:19px}.pinly-static-legal-hero time{display:block;margin-top:22px;font-weight:700}.pinly-static-legal-body{padding-bottom:42px}.pinly-static-legal-body .pinly-static-section{width:min(960px,calc(100% - 56px));padding:48px 0}.pinly-prerender footer{padding:44px max(28px,calc((100vw - 1160px)/2));color:#f4f5f8;background:#171a22}.pinly-prerender footer nav{justify-content:flex-start;margin:24px 0}.pinly-prerender footer a{color:#f4f5f8}.pinly-prerender footer small{color:#aeb4c0}@media(max-width:800px){.pinly-static-nav{grid-template-columns:auto auto}.pinly-static-nav nav{display:none}.pinly-static-hero h1,.pinly-static-legal-hero h1{font-size:40px}.pinly-static-section{grid-template-columns:1fr;gap:24px}.pinly-static-plans{grid-template-columns:1fr}}@media(max-width:560px){.pinly-static-nav{padding:12px 18px}.pinly-static-cta{padding:0 12px;font-size:13px}.pinly-static-hero{min-height:440px}.pinly-static-hero>div,.pinly-static-section,.pinly-static-steps,.pinly-static-faq,.pinly-static-bottom,.pinly-static-plans,.pinly-static-legal-hero,.pinly-static-legal-body .pinly-static-section{width:calc(100% - 40px)}.pinly-static-hero h1,.pinly-static-legal-hero h1{font-size:34px}.pinly-static-hero p,.pinly-static-legal-hero p{font-size:17px}}
  </style>`;

function buildPageHtml(page, language) {
  const content = page[language];
  const canonicalUrl = absolutePublicUrl(page.path, language);
  const imageUrl = `${PRIMARY_ORIGIN}${page.image}`;
  let html = applyOrganizationSameAs(
    applyLanguageMetadata(template, page.path, language),
  );

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
    `<link rel="canonical" href="${canonicalUrl}" />`,
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
    `${renderStaticPage(page, language)}\n    <div id="root"></div>`,
  );

  return html;
}

function buildPolicyHtml(kind, language) {
  const basePath = `/${kind}`;
  const content = getLegalContent(kind, language);
  const canonicalUrl = absolutePublicUrl(basePath, language);
  const title =
    kind === "privacy"
      ? language === "vi"
        ? "Chính sách quyền riêng tư | Pinly"
        : "Privacy Policy | Pinly"
      : language === "vi"
        ? "Điều khoản sử dụng | Pinly"
        : "Terms of Use | Pinly";
  const imageUrl = `${PRIMARY_ORIGIN}/landing/da-nang-journey-map.jpg`;
  let html = applyOrganizationSameAs(
    applyLanguageMetadata(template, basePath, language),
  );

  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(title)}</title>`,
  );
  html = replaceMeta(html, "name", "description", content.summary);
  html = replaceMeta(html, "property", "og:url", canonicalUrl);
  html = replaceMeta(html, "property", "og:title", title);
  html = replaceMeta(html, "property", "og:description", content.summary);
  html = replaceMeta(html, "property", "og:image", imageUrl);
  html = replaceMeta(html, "name", "twitter:title", title);
  html = replaceMeta(html, "name", "twitter:description", content.summary);
  html = replaceMeta(html, "name", "twitter:image", imageUrl);
  html = html.replace(
    /<link rel="canonical" href="[^"]+" \/>/,
    `<link rel="canonical" href="${canonicalUrl}" />`,
  );
  html = html.replace(/<!-- noscript fallback:[\s\S]*?<\/noscript>/, "");

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: content.title,
    description: content.summary,
    url: canonicalUrl,
    inLanguage: language,
    isPartOf: {
      "@id": `${PRIMARY_ORIGIN}/#website`,
    },
  }).replace(/</g, "\\u003c");
  html = html.replace(
    "</head>",
    `${fallbackStyles}<script id="pinly-route-schema" type="application/ld+json">${schema}</script></head>`,
  );
  html = html.replace(
    '<div id="root"></div>',
    `${renderStaticPolicyPage(kind, language)}\n    <div id="root"></div>`,
  );

  return html;
}

function writeLocalizedPage(basePath, language, html) {
  const localizedPath = getLocalizedPublicPath(basePath, language);
  const relativePath =
    localizedPath === "/"
      ? "index.html"
      : `${localizedPath.slice(1)}/index.html`;
  const outputPath = resolve(DIST_DIR, relativePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html);
}

for (const language of LANGUAGES) {
  for (const page of Object.values(PUBLIC_PAGES)) {
    writeLocalizedPage(page.path, language, buildPageHtml(page, language));
  }

  for (const kind of ["privacy", "terms"]) {
    writeLocalizedPage(`/${kind}`, language, buildPolicyHtml(kind, language));
  }
}

console.log(
  `Prerendered ${(Object.keys(PUBLIC_PAGES).length + 2) * LANGUAGES.length} localized public Pinly pages.`,
);
