import { Globe2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  PUBLIC_CHROME,
  PUBLIC_INFO_PAGE_KEYS,
  PUBLIC_PAGES,
  getLocalizedPublicPath,
  type PublicLanguage,
  type PublicPageKey,
} from "../../content/publicPages";
import { useI18n } from "../../hooks/I18nContext";
import { Logo } from "../ui/Logo";
import { PublicSocialLinks } from "./PublicSocialLinks";

const GUIDE_FOOTER_LABELS = {
  vi: {
    memoryMapGuide: "Bản đồ kỷ niệm",
    travelJournalGuide: "Nhật ký hành trình",
  },
  en: {
    memoryMapGuide: "Memory map guide",
    travelJournalGuide: "Travel journal guide",
  },
} as const;

const LEGAL_FOOTER_LABELS = {
  vi: {
    privacy: "Quyền riêng tư",
    terms: "Điều khoản",
  },
  en: {
    privacy: "Privacy",
    terms: "Terms",
  },
} as const;

export function PublicSiteHeader({
  activePageKey,
  language,
}: {
  activePageKey?: PublicPageKey;
  language: PublicLanguage;
}) {
  const { setLang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const chrome = PUBLIC_CHROME[language];

  const switchLanguage = () => {
    const nextLanguage = language === "vi" ? "en" : "vi";
    setLang(nextLanguage);
    navigate(getLocalizedPublicPath(location.pathname, nextLanguage));
  };

  return (
    <header className="public-nav">
      <Link
        className="public-brand"
        to={getLocalizedPublicPath("/", language)}
        aria-label="Pinly"
      >
        <Logo size={30} />
        <span>Pinly</span>
      </Link>

      <nav className="public-nav-links" aria-label={chrome.navLabel}>
        <Link
          to={getLocalizedPublicPath("/about", language)}
          aria-current={activePageKey === "about" ? "page" : undefined}
        >
          {chrome.about}
        </Link>
        <Link
          to={getLocalizedPublicPath("/features", language)}
          aria-current={activePageKey === "features" ? "page" : undefined}
        >
          {chrome.features}
        </Link>
        <Link
          to={getLocalizedPublicPath("/pricing", language)}
          aria-current={activePageKey === "pricing" ? "page" : undefined}
        >
          {chrome.pricing}
        </Link>
        <Link
          to={getLocalizedPublicPath("/faq", language)}
          aria-current={activePageKey === "faq" ? "page" : undefined}
        >
          {chrome.faq}
        </Link>
        <Link
          to={getLocalizedPublicPath("/careers", language)}
          aria-current={activePageKey === "careers" ? "page" : undefined}
        >
          {chrome.careers}
        </Link>
      </nav>

      <div className="public-nav-actions">
        <button
          type="button"
          className="public-language-button"
          onClick={switchLanguage}
          aria-label={chrome.language}
          title={chrome.language}
        >
          <Globe2 size={18} aria-hidden="true" />
          <span>{language === "vi" ? "VI" : "EN"}</span>
        </button>
        <Link className="public-primary-button public-nav-cta" to="/register">
          {chrome.register}
        </Link>
      </div>
    </header>
  );
}

export function PublicSiteFooter({ language }: { language: PublicLanguage }) {
  const chrome = PUBLIC_CHROME[language];

  return (
    <footer className="public-footer">
      <div className="public-footer-top">
        <Link
          className="public-brand"
          to={getLocalizedPublicPath("/", language)}
        >
          <Logo size={26} />
          <span>Pinly</span>
        </Link>
        <p>{chrome.footer}</p>
        <PublicSocialLinks language={language} tone="dark" />
      </div>
      <nav aria-label={chrome.navLabel}>
        {PUBLIC_INFO_PAGE_KEYS.map((key) => (
          <Link
            key={key}
            to={getLocalizedPublicPath(PUBLIC_PAGES[key].path, language)}
          >
            {key === "memoryMapGuide" || key === "travelJournalGuide"
              ? GUIDE_FOOTER_LABELS[language][key]
              : PUBLIC_PAGES[key][language].eyebrow}
          </Link>
        ))}
        <Link to={getLocalizedPublicPath("/privacy", language)}>
          {LEGAL_FOOTER_LABELS[language].privacy}
        </Link>
        <Link to={getLocalizedPublicPath("/terms", language)}>
          {LEGAL_FOOTER_LABELS[language].terms}
        </Link>
        <Link to="/login">{chrome.login}</Link>
      </nav>
      <small>© 2026 Pinly</small>
    </footer>
  );
}
