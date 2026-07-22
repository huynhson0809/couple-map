import { useEffect } from "react";
import {
  PUBLIC_PAGES,
  getPublicPageSchema,
  type PublicLanguage,
  type PublicPageKey,
} from "../content/publicPages";
import {
  getAbsolutePublicUrl,
  PRIMARY_ORIGIN,
  syncPublicLanguageLinks,
} from "../lib/publicSeo";

const ROUTE_SCHEMA_ID = "pinly-route-schema";

function setMeta(selector: string, attribute: string, value: string) {
  const element = document.head.querySelector<HTMLMetaElement>(selector);
  if (element) {
    element.setAttribute(attribute, value);
  }
}

export function usePublicPageSeo(
  pageKey: PublicPageKey,
  language: PublicLanguage,
) {
  useEffect(() => {
    const page = PUBLIC_PAGES[pageKey];
    const content = page[language];
    const canonicalUrl = getAbsolutePublicUrl(page.path, language);
    const imageUrl = `${PRIMARY_ORIGIN}${page.image}`;

    document.documentElement.lang = language;
    document.title = content.metaTitle;

    setMeta('meta[name="description"]', "content", content.metaDescription);
    setMeta('meta[property="og:url"]', "content", canonicalUrl);
    setMeta('meta[property="og:title"]', "content", content.metaTitle);
    setMeta(
      'meta[property="og:description"]',
      "content",
      content.metaDescription,
    );
    setMeta('meta[property="og:image"]', "content", imageUrl);
    setMeta(
      'meta[property="og:locale"]',
      "content",
      language === "vi" ? "vi_VN" : "en_US",
    );
    setMeta(
      'meta[property="og:locale:alternate"]',
      "content",
      language === "vi" ? "en_US" : "vi_VN",
    );
    setMeta('meta[name="twitter:title"]', "content", content.metaTitle);
    setMeta(
      'meta[name="twitter:description"]',
      "content",
      content.metaDescription,
    );
    setMeta('meta[name="twitter:image"]', "content", imageUrl);

    const canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    canonical?.setAttribute("href", canonicalUrl);
    syncPublicLanguageLinks(page.path);

    document.getElementById(ROUTE_SCHEMA_ID)?.remove();
    const schema = document.createElement("script");
    schema.id = ROUTE_SCHEMA_ID;
    schema.type = "application/ld+json";
    schema.textContent = JSON.stringify(
      getPublicPageSchema(page, language),
    ).replace(/</g, "\\u003c");
    document.head.appendChild(schema);

    return () => {
      schema.remove();
    };
  }, [language, pageKey]);
}
