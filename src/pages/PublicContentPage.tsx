import {
  ArrowRight,
  Check,
  CircleHelp,
  MapPin,
} from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  PUBLIC_CHROME,
  PUBLIC_PAGES,
  getLocalizedPublicPath,
  type PublicLanguage,
  type PublicPageKey,
} from "../content/publicPages";
import {
  PublicSiteFooter,
  PublicSiteHeader,
} from "../components/public/PublicSiteChrome";
import { useI18n } from "../hooks/I18nContext";
import { usePublicPageSeo } from "../hooks/usePublicPageSeo";
import "./PublicContentPage.css";

const FEATURED_RELATED_KEYS: Record<PublicPageKey, PublicPageKey[]> = {
  home: ["about", "features", "faq"],
  about: ["features", "careers", "faq"],
  features: ["pricing", "memoryMapGuide", "faq"],
  pricing: ["features", "faq", "memoryMapGuide"],
  faq: ["about", "pricing", "memoryMapGuide"],
  careers: ["about", "features", "pricing"],
  memoryMapGuide: ["travelJournalGuide", "features", "faq"],
  travelJournalGuide: ["memoryMapGuide", "features", "pricing"],
};

export function PublicContentPage({
  pageKey,
  language,
}: {
  pageKey: PublicPageKey;
  language: PublicLanguage;
}) {
  const { setLang } = useI18n();
  const lang = language;
  const page = PUBLIC_PAGES[pageKey];
  const content = page[lang];
  const chrome = PUBLIC_CHROME[lang];
  const relatedPages = FEATURED_RELATED_KEYS[pageKey].map(
    (key) => PUBLIC_PAGES[key],
  );

  usePublicPageSeo(pageKey, lang);

  useEffect(() => {
    setLang(language);
  }, [language, setLang]);

  return (
    <div className="public-page">
      <PublicSiteHeader activePageKey={pageKey} language={language} />

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
                <Link
                  to={getLocalizedPublicPath(related.path, language)}
                  key={related.key}
                >
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

      <PublicSiteFooter language={language} />
    </div>
  );
}
