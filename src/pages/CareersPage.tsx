import {
  ArrowDown,
  ArrowRight,
  Check,
  CircleDollarSign,
  Clock3,
  Handshake,
  Mail,
  Rocket,
  Send,
  Sparkles,
} from "lucide-react";
import { useEffect, type CSSProperties } from "react";
import {
  PublicSiteFooter,
  PublicSiteHeader,
} from "../components/public/PublicSiteChrome";
import {
  CAREERS_CONTENT,
  PUBLIC_PAGES,
  type PublicLanguage,
} from "../content/publicPages";
import {
  DEFAULT_CAREERS_EMAIL,
  createCareersMailto,
} from "../config/careers";
import { useI18n } from "../hooks/I18nContext";
import { usePublicPageSeo } from "../hooks/usePublicPageSeo";
import "./PublicContentPage.css";
import "./CareersPage.css";

const FACT_ICONS = [Rocket, Clock3, CircleDollarSign] as const;

export function CareersPage({ language }: { language: PublicLanguage }) {
  const { setLang } = useI18n();
  const page = PUBLIC_PAGES.careers;
  const content = CAREERS_CONTENT[language];
  const careersEmail = DEFAULT_CAREERS_EMAIL;
  const applicationHref = createCareersMailto(careersEmail, language);

  usePublicPageSeo("careers", language);

  useEffect(() => {
    setLang(language);
  }, [language, setLang]);

  useEffect(() => {
    const revealNodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".careers-page [data-career-reveal]",
      ),
    );
    if (!revealNodes.length) return undefined;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealNodes.forEach((node) => node.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12 },
    );

    revealNodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="public-page careers-page">
      <PublicSiteHeader activePageKey="careers" language={language} />

      <main>
        <section
          className="careers-hero"
          style={
            {
              "--careers-hero-image": `url(${page.image})`,
            } as CSSProperties
          }
          aria-labelledby="careers-title"
        >
          <div className="careers-hero-overlay" aria-hidden="true" />
          <div className="careers-hero-inner">
            <div className="careers-hero-copy">
              <span className="careers-kicker">
                <Handshake size={18} aria-hidden="true" />
                {content.heroEyebrow}
              </span>
              <h1 id="careers-title">{content.heroTitle}</h1>
              <p>{content.heroDescription}</p>
              <div className="careers-hero-actions">
                <a
                  className="public-primary-button careers-apply-button"
                  href={applicationHref}
                >
                  <Send size={18} aria-hidden="true" />
                  {content.primaryAction}
                </a>
                <a className="careers-secondary-action" href="#career-role">
                  {content.secondaryAction}
                  <ArrowDown size={18} aria-hidden="true" />
                </a>
              </div>
            </div>

            <dl className="careers-facts" aria-label={content.heroTitle}>
              {content.facts.map((fact, index) => {
                const Icon = FACT_ICONS[index] ?? Sparkles;
                return (
                  <div key={fact.label}>
                    <Icon size={19} aria-hidden="true" />
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </section>

        <section
          id="career-role"
          className="careers-editorial-band"
          data-career-reveal
        >
          <div className="careers-content careers-editorial-grid">
            <header>
              <span className="careers-section-label">
                {content.whyEyebrow}
              </span>
              <h2>{content.whyTitle}</h2>
            </header>
            <div className="careers-editorial-copy">
              {content.whyParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>

        <section className="careers-ownership-band">
          <div className="careers-content" data-career-reveal>
            <header className="careers-wide-heading">
              <span className="careers-section-label">
                {content.responsibilitiesEyebrow}
              </span>
              <h2>{content.responsibilitiesTitle}</h2>
              <p>{content.responsibilitiesIntro}</p>
            </header>

            <ol className="careers-responsibility-list">
              {content.responsibilities.map((responsibility, index) => (
                <li key={responsibility}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{responsibility}</p>
                  <ArrowRight size={20} aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="careers-fit-band">
          <div className="careers-content careers-fit-grid">
            <article data-career-reveal>
              <span className="careers-section-label">{content.fitEyebrow}</span>
              <h2>{content.fitTitle}</h2>
              <ul>
                {content.fitItems.map((item) => (
                  <li key={item}>
                    <Check size={18} aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="careers-context-note">{content.fitNote}</p>
            </article>

            <article data-career-reveal>
              <span className="careers-section-label">
                {content.offerEyebrow}
              </span>
              <h2>{content.offerTitle}</h2>
              <ul>
                {content.offerItems.map((item) => (
                  <li key={item}>
                    <Check size={18} aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="careers-context-note">{content.offerIntro}</p>
            </article>
          </div>
        </section>

        <section className="careers-process-band">
          <div className="careers-content" data-career-reveal>
            <header className="careers-process-heading">
              <div>
                <span className="careers-section-label">
                  {content.processEyebrow}
                </span>
                <h2>{content.processTitle}</h2>
              </div>
              <p>{content.processDescription}</p>
            </header>

            <ol className="careers-process-list">
              {content.process.map((step, index) => (
                <li key={step.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="careers-application-band" id="apply">
          <div className="careers-content careers-application-layout" data-career-reveal>
            <div>
              <span className="careers-kicker">
                <Mail size={18} aria-hidden="true" />
                {content.applyEyebrow}
              </span>
              <h2>{content.applyTitle}</h2>
              <p>{content.applyDescription}</p>
            </div>
            <div className="careers-application-action">
              <a
                className="public-primary-button careers-apply-button"
                href={applicationHref}
              >
                <Send size={18} aria-hidden="true" />
                {content.applyAction}
              </a>
              <div className="careers-email">
                <span>{content.applyEmailLabel}</span>
                <a href={applicationHref}>{careersEmail}</a>
              </div>
              <small>{content.applicationNote}</small>
            </div>
          </div>
        </section>
      </main>

      <PublicSiteFooter language={language} />
    </div>
  );
}
