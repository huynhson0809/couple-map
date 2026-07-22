import {
  getLocalizedPublicPath,
  type PublicLanguage,
} from "../content/publicPages";

export const PRIMARY_ORIGIN = "https://pinly.tech";

export function getAbsolutePublicUrl(
  basePath: string,
  language: PublicLanguage,
) {
  return `${PRIMARY_ORIGIN}${getLocalizedPublicPath(basePath, language)}`;
}

export function syncPublicLanguageLinks(basePath: string) {
  const variants = [
    { hreflang: "en", href: getAbsolutePublicUrl(basePath, "en") },
    { hreflang: "vi", href: getAbsolutePublicUrl(basePath, "vi") },
    { hreflang: "x-default", href: getAbsolutePublicUrl(basePath, "en") },
  ];

  for (const variant of variants) {
    let link = document.head.querySelector<HTMLLinkElement>(
      `link[rel="alternate"][hreflang="${variant.hreflang}"]`,
    );
    if (!link) {
      link = document.createElement("link");
      link.rel = "alternate";
      link.hreflang = variant.hreflang;
      document.head.appendChild(link);
    }
    link.href = variant.href;
  }
}
