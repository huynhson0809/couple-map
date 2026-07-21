import {
  ArrowRight,
  Check,
  CircleHelp,
  Globe2,
  MapPin,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  PUBLIC_CHROME,
  PUBLIC_INFO_PAGE_KEYS,
  PUBLIC_PAGES,
  type PublicPageKey,
} from "../content/publicPages";
import { useI18n } from "../hooks/I18nContext";
import { usePublicPageSeo } from "../hooks/usePublicPageSeo";
import { Logo } from "../components/ui/Logo";
import "./PublicContentPage.css";

const FEATURED_RELATED_KEYS: Record<PublicPageKey, PublicPageKey[]> = {
  home: ["about", "features", "faq"],
  about: ["features", "memoryMapGuide", "faq"],
  features: ["pricing", "memoryMapGuide", "faq"],
  pricing: ["features", "faq", "memoryMapGuide"],
  faq: ["about", "pricing", "memoryMapGuide"],
  memoryMapGuide: ["travelJournalGuide", "features", "faq"],
  travelJournalGuide: ["memoryMapGuide", "features", "pricing"],
};

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

export function PublicContentPage({ pageKey }: { pageKey: PublicPageKey }) {
  const { lang, setLang } = useI18n();
  const page = PUBLIC_PAGES[pageKey];
  const content = page[lang];
  const chrome = PUBLIC_CHROME[lang];
  const relatedPages = FEATURED_RELATED_KEYS[pageKey].map(
    (key) => PUBLIC_PAGES[key],
  );

  usePublicPageSeo(pageKey, lang);

  return (
    <div className="public-page">
      <header className="public-nav">
        <Link className="public-brand" to="/" aria-label="Pinly">
          <Logo size={30} />
          <span>Pinly</span>
        </Link>

        <nav className="public-nav-links" aria-label={chrome.navLabel}>
          <Link to="/about" aria-current={pageKey === "about" ? "page" : undefined}>
            {chrome.about}
          </Link>
          <Link
            to="/features"
            aria-current={pageKey === "features" ? "page" : undefined}
          >
            {chrome.features}
          </Link>
          <Link
            to="/pricing"
            aria-current={pageKey === "pricing" ? "page" : undefined}
          >
            {chrome.pricing}
          </Link>
          <Link to="/faq" aria-current={pageKey === "faq" ? "page" : undefined}>
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

      <main>
        <section
          className="public-hero"
          style={{ "--public-hero-image": `url(${page.image})` } as React.CSSProperties}
        >
          <div className="public-hero-inner">
            <span className="public-eyebrow">
              <MapPin size={17} aria-hidden="true" />
              {content.eyebrow}
            </span>
            <h1>{content.title}</h1>
            <p>{content.description}</p>
          </div>
        </section>

        {content.plans && (
          <section className="public-pricing-band" aria-labelledby="plan-heading">
            <div className="public-content-width">
              <h2 id="plan-heading" className="public-visually-hidden">
                {chrome.pricing}
              </h2>
              <div className="public-plan-grid">
                {content.plans.map((plan, index) => (
                  <article
                    className={`public-plan ${index === 1 ? "is-featured" : ""}`}
                    key={plan.name}
                  >
                    <header>
                      <span>{plan.name}</span>
                      <strong>{plan.monthlyPrice}</strong>
                      <small>{plan.annualPrice}</small>
                    </header>
                    <p>{plan.description}</p>
                    <ul>
                      {plan.features.map((feature) => (
                        <li key={feature}>
                          <Check size={17} aria-hidden="true" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {content.steps && (
          <section className="public-steps-band" aria-labelledby="steps-heading">
            <div className="public-content-width">
              <div className="public-section-intro">
                <span>{content.eyebrow}</span>
                <h2 id="steps-heading">{content.title}</h2>
              </div>
              <ol className="public-step-list">
                {content.steps.map((step, index) => (
                  <li key={step}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {content.sections.map((section, index) => (
          <section
            className={`public-copy-band ${index % 2 === 1 ? "is-tinted" : ""}`}
            key={section.title}
          >
            <div className="public-copy-layout">
              <h2>{section.title}</h2>
              <div className="public-copy-body">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>
                        <Check size={17} aria-hidden="true" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ))}

        {content.questions && (
          <section className="public-faq-band">
            <div className="public-content-width public-faq-layout">
              <header>
                <span className="public-eyebrow">
                  <CircleHelp size={17} aria-hidden="true" />
                  {content.eyebrow}
                </span>
                <h2>{content.title}</h2>
              </header>
              <div className="public-faq-list">
                {content.questions.map((item, index) => (
                  <details key={item.question} open={index === 0}>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="public-related-band" aria-labelledby="related-heading">
          <div className="public-content-width">
            <h2 id="related-heading">{chrome.related}</h2>
            <div className="public-related-links">
              {relatedPages.map((related) => (
                <Link to={related.path} key={related.key}>
                  <span>{related[lang].eyebrow}</span>
                  <strong>{related[lang].title}</strong>
                  <ArrowRight size={20} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="public-cta-band">
          <div className="public-content-width public-cta-layout">
            <div>
              <h2>{content.ctaTitle}</h2>
              <p>{content.ctaDescription}</p>
            </div>
            <Link className="public-primary-button" to="/register">
              <MapPin size={18} aria-hidden="true" />
              {chrome.register}
            </Link>
          </div>
        </section>
      </main>

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
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/login">{chrome.login}</Link>
        </nav>
        <small>© 2026 Pinly</small>
      </footer>
    </div>
  );
}
