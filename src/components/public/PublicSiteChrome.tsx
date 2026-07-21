import { Globe2 } from "lucide-react";
import { Link } from "react-router-dom";
import {
  PUBLIC_CHROME,
  PUBLIC_INFO_PAGE_KEYS,
  PUBLIC_PAGES,
  type PublicPageKey,
} from "../../content/publicPages";
import { useI18n } from "../../hooks/I18nContext";
import { Logo } from "../ui/Logo";

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
}: {
  activePageKey?: PublicPageKey;
}) {
  const { lang, setLang } = useI18n();
  const chrome = PUBLIC_CHROME[lang];

  return (
    <header className="public-nav">
      <Link className="public-brand" to="/" aria-label="Pinly">
        <Logo size={30} />
        <span>Pinly</span>
      </Link>

      <nav className="public-nav-links" aria-label={chrome.navLabel}>
        <Link
          to="/about"
          aria-current={activePageKey === "about" ? "page" : undefined}
        >
          {chrome.about}
        </Link>
        <Link
          to="/features"
          aria-current={activePageKey === "features" ? "page" : undefined}
        >
          {chrome.features}
        </Link>
        <Link
          to="/pricing"
          aria-current={activePageKey === "pricing" ? "page" : undefined}
        >
          {chrome.pricing}
        </Link>
        <Link
          to="/faq"
          aria-current={activePageKey === "faq" ? "page" : undefined}
        >
          {chrome.faq}
        </Link>
      </nav>

      <div className="public-nav-actions">
        <button
          type="button"
          className="public-language-button"
          onClick={() => setLang(lang === "vi" ? "en" : "vi")}
          aria-label={chrome.language}
          title={chrome.language}
        >
          <Globe2 size={18} aria-hidden="true" />
          <span>{lang === "vi" ? "VI" : "EN"}</span>
        </button>
        <Link className="public-primary-button public-nav-cta" to="/register">
          {chrome.register}
        </Link>
      </div>
    </header>
  );
}

export function PublicSiteFooter() {
  const { lang } = useI18n();
  const chrome = PUBLIC_CHROME[lang];

  return (
    <footer className="public-footer">
      <div className="public-footer-top">
        <Link className="public-brand" to="/">
          <Logo size={26} />
          <span>Pinly</span>
        </Link>
        <p>{chrome.footer}</p>
      </div>
      <nav aria-label={chrome.navLabel}>
        {PUBLIC_INFO_PAGE_KEYS.map((key) => (
          <Link key={key} to={PUBLIC_PAGES[key].path}>
            {key === "memoryMapGuide" || key === "travelJournalGuide"
              ? GUIDE_FOOTER_LABELS[lang][key]
              : PUBLIC_PAGES[key][lang].eyebrow}
          </Link>
        ))}
        <Link to="/privacy">{LEGAL_FOOTER_LABELS[lang].privacy}</Link>
        <Link to="/terms">{LEGAL_FOOTER_LABELS[lang].terms}</Link>
        <Link to="/login">{chrome.login}</Link>
      </nav>
      <small>© 2026 Pinly</small>
    </footer>
  );
}
