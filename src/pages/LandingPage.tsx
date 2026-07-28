import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Compass,
  Download,
  EllipsisVertical,
  Globe2,
  LockKeyhole,
  MapPin,
  Share,
  Share2,
  Smartphone,
  SquarePlus,
  UsersRound,
} from "lucide-react";
import { LandingMapScene } from "../components/landing/LandingMapScene";
import { PublicSocialLinks } from "../components/public/PublicSocialLinks";
import { Logo } from "../components/ui/Logo";
import {
  PUBLIC_INFO_PAGE_KEYS,
  PUBLIC_PAGES,
  getLocalizedPublicPath,
  type PublicLanguage,
} from "../content/publicPages";
import {
  translate,
  useI18n,
  type I18nKey,
} from "../hooks/I18nContext";
import { usePublicPageSeo } from "../hooks/usePublicPageSeo";
import "./LandingPage.css";

type PrivacyMode = "private" | "shared";
type InstallPlatform = "ios" | "android";

function ChromeMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <path d="M21.17 8H12" />
      <path d="m3.95 6.06 4.59 7.94" />
      <path d="m10.88 21.94 4.58-7.94" />
    </svg>
  );
}

export function LandingPage({
  language = "en",
}: {
  language?: PublicLanguage;
}) {
  const { setLang } = useI18n();
  const navigate = useNavigate();
  const lang = language;
  const t = (
    key: I18nKey,
    values?: Record<string, string | number>,
  ) => translate(language, key, values);
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>("shared");
  const [installPlatform, setInstallPlatform] =
    useState<InstallPlatform>("ios");

  usePublicPageSeo("home", lang);

  useEffect(() => {
    setLang(language);
  }, [language, setLang]);

  useEffect(() => {
    const revealNodes = Array.from(
      document.querySelectorAll<HTMLElement>(".lp [data-reveal]"),
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
      { threshold: 0.14 },
    );

    revealNodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const installSteps =
    installPlatform === "ios"
      ? [
          {
            label: t("landing.installIos1"),
            icon: <Compass size={20} strokeWidth={1.8} aria-hidden="true" />,
          },
          {
            label: t("landing.installIos2"),
            icon: <Share size={20} strokeWidth={1.8} aria-hidden="true" />,
          },
          {
            label: t("landing.installIos3"),
            icon: (
              <SquarePlus size={20} strokeWidth={1.8} aria-hidden="true" />
            ),
          },
        ]
      : [
          {
            label: t("landing.installAndroid1"),
            icon: <ChromeMark size={20} />,
          },
          {
            label: t("landing.installAndroid2"),
            icon: (
              <EllipsisVertical
                size={20}
                strokeWidth={2.2}
                aria-hidden="true"
              />
            ),
          },
          {
            label: t("landing.installAndroid3"),
            icon: (
              <Smartphone size={20} strokeWidth={1.8} aria-hidden="true" />
            ),
          },
        ];

  const switchLanguage = () => {
    const nextLanguage = language === "vi" ? "en" : "vi";
    setLang(nextLanguage);
    navigate(getLocalizedPublicPath("/", nextLanguage));
  };

  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-nav-brand" href="#top" aria-label="Pinly">
          <Logo size={30} />
          <span>Pinly</span>
        </a>

        <nav className="lp-nav-links" aria-label={t("landing.navLabel")}>
          <a href="#story">{t("landing.navStories")}</a>
          <a href="#install">{t("landing.ctaInstall")}</a>
        </nav>

        <div className="lp-nav-actions">
          <button
            type="button"
            className="lp-lang-btn"
            onClick={switchLanguage}
            aria-label={t("landing.languageLabel")}
          >
            <Globe2 size={16} aria-hidden="true" />
            <span>{lang === "vi" ? "Tiếng Việt" : "English"}</span>
          </button>
          <Link className="lp-nav-cta" to="/register">
            {t("landing.getStarted")}
          </Link>
        </div>
      </header>

      <main>
        <section className="lp-hero" id="top" aria-labelledby="lp-hero-title">
          <LandingMapScene label={t("landing.heroMapLabel")} />
          <div className="lp-map-wash" aria-hidden="true" />

          <div className="lp-hero-copy">
            <h1 id="lp-hero-title">
              <span>{t("landing.heroTitle")}</span>
              <strong>{t("landing.heroAccent")}</strong>
            </h1>
            <p>{t("landing.heroDesc")}</p>
            <div className="lp-hero-actions">
              <Link className="lp-btn-primary" to="/register">
                <MapPin size={17} aria-hidden="true" />
                {t("landing.ctaPrimary")}
              </Link>
              <a className="lp-btn-journey" href="#story">
                {t("landing.ctaLearnMore")}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>
          </div>

          <figure className="lp-memory-photo lp-memory-photo-rooftop">
            <img
              src="/landing/rooftop-da-nang.jpg"
              alt={t("landing.altRooftop")}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <figcaption>
              <MapPin size={17} aria-hidden="true" />
              <span>
                <strong>{t("landing.memoryRooftopTitle")}</strong>
                <small>{t("landing.memoryRooftopTime")}</small>
              </span>
            </figcaption>
          </figure>

          <figure className="lp-memory-photo lp-memory-photo-beach">
            <img
              src="/landing/my-khe-morning.jpg"
              alt={t("landing.altBeach")}
              loading="eager"
              decoding="async"
            />
            <figcaption>
              <MapPin size={17} aria-hidden="true" />
              <span>
                <strong>{t("landing.memoryBeachTitle")}</strong>
                <small>{t("landing.memoryBeachTime")}</small>
              </span>
            </figcaption>
          </figure>

          <figure className="lp-memory-photo lp-memory-photo-hoi-an">
            <img
              src="/landing/hoi-an-family.jpg"
              alt={t("landing.altHoiAn")}
              loading="eager"
              decoding="async"
            />
            <figcaption>
              <MapPin size={17} aria-hidden="true" />
              <span>
                <strong>{t("landing.memoryHoiAnTitle")}</strong>
                <small>{t("landing.memoryHoiAnTime")}</small>
              </span>
            </figcaption>
          </figure>

          <div className="lp-route-note" aria-hidden="true">
            <span />
            <strong>{t("landing.memoryBridgeTitle")}</strong>
            <small>{t("landing.memoryBridgeTime")}</small>
          </div>
        </section>

        <section className="lp-featured" id="story">
          <div className="lp-featured-inner" data-reveal>
            <figure className="lp-featured-media">
              <img
                src="/landing/rooftop-da-nang-feature.jpg"
                alt={t("landing.altRooftop")}
                loading="lazy"
                decoding="async"
              />
            </figure>

            <div className="lp-featured-content">
              <div className="lp-kicker">
                <MapPin size={17} aria-hidden="true" />
                <span>{t("landing.featuredLocation")}</span>
              </div>
              <h2>{t("landing.featuredTitle")}</h2>
              <time>{t("landing.featuredDate")}</time>

              <div className="lp-privacy-block">
                <span className="lp-control-label">
                  {t("landing.featuredPrivacy")}
                </span>
                <div
                  className="lp-privacy-control"
                  role="group"
                  aria-label={t("landing.featuredPrivacy")}
                >
                  <button
                    type="button"
                    className={privacyMode === "private" ? "is-active" : ""}
                    onClick={() => setPrivacyMode("private")}
                    aria-pressed={privacyMode === "private"}
                  >
                    <LockKeyhole size={16} aria-hidden="true" />
                    {t("landing.privacyPrivate")}
                  </button>
                  <button
                    type="button"
                    className={privacyMode === "shared" ? "is-active" : ""}
                    onClick={() => setPrivacyMode("shared")}
                    aria-pressed={privacyMode === "shared"}
                  >
                    <UsersRound size={17} aria-hidden="true" />
                    {t("landing.privacyShared")}
                  </button>
                </div>
                <p>
                  {privacyMode === "private"
                    ? t("landing.privacyPrivateDesc")
                    : t("landing.privacySharedDesc")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-circles">
          <div className="lp-circles-inner" data-reveal>
            <header className="lp-section-heading">
              <span>{t("landing.modesEyebrow")}</span>
              <h2>{t("landing.modesTitle")}</h2>
              <p>{t("landing.modesDesc")}</p>
            </header>

            <div className="lp-circle-gallery">
              <article className="lp-circle-item">
                <img
                  src="/landing/my-khe-morning.jpg"
                  alt={t("landing.altBeach")}
                  loading="lazy"
                  decoding="async"
                />
                <div>
                  <span className="lp-circle-item-icon">
                    <LockKeyhole aria-hidden="true" />
                  </span>
                  <span>{t("landing.modeSolo")}</span>
                </div>
              </article>
              <article className="lp-circle-item">
                <img
                  src="/landing/rooftop-da-nang.jpg"
                  alt={t("landing.altRooftop")}
                  loading="lazy"
                  decoding="async"
                />
                <div>
                  <span className="lp-circle-item-icon">
                    <Share2 aria-hidden="true" />
                  </span>
                  <span>{t("landing.modeFriends")}</span>
                </div>
              </article>
              <article className="lp-circle-item">
                <img
                  src="/landing/hoi-an-family.jpg"
                  alt={t("landing.altHoiAn")}
                  loading="lazy"
                  decoding="async"
                />
                <div>
                  <span className="lp-circle-item-icon">
                    <UsersRound aria-hidden="true" />
                  </span>
                  <span>{t("landing.modeFamily")}</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-install" id="install">
          <div className="lp-install-inner" data-reveal>
            <div className="lp-install-copy">
              <div className="lp-kicker">
                <Download size={17} aria-hidden="true" />
                <span>{t("landing.installKicker")}</span>
              </div>
              <h2>{t("landing.installTitle")}</h2>
              <p>{t("landing.installDesc")}</p>

              <div className="lp-install-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={installPlatform === "ios"}
                  className={installPlatform === "ios" ? "is-active" : ""}
                  onClick={() => setInstallPlatform("ios")}
                >
                  iPhone / iPad
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={installPlatform === "android"}
                  className={installPlatform === "android" ? "is-active" : ""}
                  onClick={() => setInstallPlatform("android")}
                >
                  Android
                </button>
              </div>

              <ol className="lp-install-steps">
                {installSteps.map((step) => (
                  <li key={step.label}>
                    <span className="lp-install-step-icon">{step.icon}</span>
                    <span>{step.label}</span>
                  </li>
                ))}
              </ol>
            </div>

            <figure className="lp-install-media">
              <img
                src="/icons/install-guide.png"
                alt={t("landing.installAlt")}
                loading="lazy"
                decoding="async"
              />
            </figure>
          </div>
        </section>

        <section className="lp-bottom-cta">
          <div className="lp-bottom-cta-inner" data-reveal>
            <div>
              <h2>{t("landing.bottomCtaTitle")}</h2>
              <p>{t("landing.bottomCtaDesc")}</p>
            </div>
            <Link className="lp-btn-primary" to="/register">
              <MapPin size={17} aria-hidden="true" />
              {t("landing.bottomCtaBtn")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Logo size={24} />
          <span>Pinly</span>
        </div>
        <p>{t("landing.footerTagline")}</p>
        <div className="lp-footer-meta">
          <PublicSocialLinks language={language} tone="light" />
          <small>© 2026 Pinly</small>
        </div>
        <div className="lp-footer-links">
          {PUBLIC_INFO_PAGE_KEYS.map((key) => (
            <Link
              key={key}
              to={getLocalizedPublicPath(PUBLIC_PAGES[key].path, language)}
            >
              {PUBLIC_PAGES[key][lang].eyebrow}
            </Link>
          ))}
          <Link to={getLocalizedPublicPath("/privacy", language)}>
            {t("legal.privacy")}
          </Link>
          <Link to={getLocalizedPublicPath("/terms", language)}>
            {t("legal.terms")}
          </Link>
          <Link to="/login">{t("landing.login")}</Link>
        </div>
      </footer>
    </div>
  );
}
