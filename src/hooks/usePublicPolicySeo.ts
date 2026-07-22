import { useEffect } from "react";
import type { Lang } from "./I18nContext";
import { getLegalContent, type PolicyKind } from "../lib/legalContent";
import {
  getAbsolutePublicUrl,
  PRIMARY_ORIGIN,
  syncPublicLanguageLinks,
} from "../lib/publicSeo";

const ROUTE_SCHEMA_ID = "pinly-route-schema";
const SOCIAL_IMAGE = `${PRIMARY_ORIGIN}/landing/da-nang-journey-map.jpg`;

const POLICY_TITLES = {
  vi: {
    privacy: "Chính sách quyền riêng tư | Pinly",
    terms: "Điều khoản sử dụng | Pinly",
  },
  en: {
    privacy: "Privacy Policy | Pinly",
    terms: "Terms of Use | Pinly",
  },
} as const;

function setMeta(selector: string, value: string) {
  document.head
    .querySelector<HTMLMetaElement>(selector)
    ?.setAttribute("content", value);
}

export function usePublicPolicySeo(kind: PolicyKind, lang: Lang) {
  useEffect(() => {
    const content = getLegalContent(kind, lang);
    const basePath = `/${kind}`;
    const canonicalUrl = getAbsolutePublicUrl(basePath, lang);
    const title = POLICY_TITLES[lang][kind];

    document.documentElement.lang = lang;
    document.title = title;

    setMeta('meta[name="description"]', content.summary);
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', content.summary);
    setMeta('meta[property="og:image"]', SOCIAL_IMAGE);
    setMeta(
      'meta[property="og:locale"]',
      lang === "vi" ? "vi_VN" : "en_US",
    );
    setMeta(
      'meta[property="og:locale:alternate"]',
      lang === "vi" ? "en_US" : "vi_VN",
    );
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', content.summary);
    setMeta('meta[name="twitter:image"]', SOCIAL_IMAGE);

    document.head
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute("href", canonicalUrl);
    syncPublicLanguageLinks(basePath);

    document.getElementById(ROUTE_SCHEMA_ID)?.remove();
    const schema = document.createElement("script");
    schema.id = ROUTE_SCHEMA_ID;
    schema.type = "application/ld+json";
    schema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: content.title,
      description: content.summary,
      url: canonicalUrl,
      inLanguage: lang === "vi" ? "vi-VN" : "en",
      isPartOf: {
        "@id": `${PRIMARY_ORIGIN}/#website`,
      },
    }).replace(/</g, "\\u003c");
    document.head.appendChild(schema);

    return () => {
      schema.remove();
    };
  }, [kind, lang]);
}
