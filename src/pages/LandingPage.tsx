import { Link } from "react-router-dom";
import { MapPin, Flame, Camera, Heart, Download, Globe, Lock } from "lucide-react";
import { Logo } from "../components/ui/Logo";
import { useI18n } from "../hooks/I18nContext";
import { useState } from "react";
import "./LandingPage.css";

export function LandingPage() {
  const { t, lang, setLang } = useI18n();
  const [installTab, setInstallTab] = useState<"ios" | "android">("ios");

  return (
    <div className="lp">
      {/* Nav */}
      <header className="lp-nav">
        <div className="lp-nav-brand">
          <Logo size={28} />
          <span>Pinly</span>
        </div>
        <div className="lp-nav-links">
          <a href="#features">{t("landing.featuresTitle")}</a>
          <a href="#install">{t("landing.ctaInstall")}</a>
        </div>
        <div className="lp-nav-right">
          <button
            type="button"
            className="lp-lang-btn"
            onClick={() => setLang(lang === "vi" ? "en" : "vi")}
          >
            <Globe size={14} />
            {t("landing.langSwitch")}
          </button>
          <Link to="/register" className="lp-nav-cta">
            {t("landing.getStarted")}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-hero-badge">
          <Flame size={12} />
          <span>{t("landing.heroBadge")}</span>
        </div>
        <div className="lp-hero-content">
          <div className="lp-hero-text">
            <h1>
              {t("landing.heroTitle")}
              <br />
              <span className="lp-text-gradient">
                {t("landing.heroAccent")}
              </span>
            </h1>
            <p>{t("landing.heroDesc")}</p>
            <div className="lp-hero-btns">
              <Link to="/register" className="lp-btn-primary">
                {t("landing.ctaPrimary")}
              </Link>
              <a href="#install" className="lp-btn-outline">
                <Download size={16} />
                {t("landing.ctaInstall")}
              </a>
            </div>
            <div className="lp-hero-proof">
              <span className="lp-hero-proof-text">
                {t("landing.proofSpaces")}
              </span>
            </div>
          </div>
          <div className="lp-hero-visual">
            <div
              className="lp-space-showcase"
              aria-label={t("landing.spaceShowcaseTitle")}
            >
              <div className="lp-space-panel">
                <div className="lp-space-panel-header">
                  <span>{t("landing.spaceShowcaseTitle")}</span>
                  <span>{t("landing.spaceInvite")}</span>
                </div>
                <div className="lp-space-list">
                  <div className="lp-space-card active lp-space-card-one">
                    <span>{t("landing.spacePersonal")}</span>
                    <small>{t("landing.spacePrivate")}</small>
                  </div>
                  <div className="lp-space-card lp-space-card-two">
                    <span>{t("landing.spaceTrip")}</span>
                    <small>{t("landing.spaceMembers")}</small>
                  </div>
                  <div className="lp-space-card lp-space-card-three">
                    <span>{t("landing.spaceFamily")}</span>
                    <small>{t("landing.spaceShared")}</small>
                  </div>
                  <div className="lp-space-card lp-space-card-four">
                    <span>{t("landing.spaceFriends")}</span>
                    <small>{t("landing.spaceInvite")}</small>
                  </div>
                </div>
              </div>
              <div className="lp-memory-map-stage">
                <div className="lp-map-scan" aria-hidden="true" />
                <div className="lp-memory-map">
                  <img
                    src="/icons/map-preview.png"
                    alt="Pinly map"
                    className="lp-memory-map-img"
                  />
                  <span className="lp-map-pin one" />
                  <span className="lp-map-pin two" />
                  <span className="lp-map-pin three" />
                  <span className="lp-memory-chip lp-memory-chip-one">51</span>
                  <span className="lp-memory-chip lp-memory-chip-two">366</span>
                  <div className="lp-map-caption">
                    <MapPin size={14} />
                    <span>{t("landing.mockupTagline")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="lp-features" id="features">
        <h2>{t("landing.featuresTitle")}</h2>
        <p className="lp-features-sub">{t("landing.featuresSub")}</p>
        <div className="lp-features-grid">
          <div className="lp-fcard lp-fcard-wide">
            <div className="lp-fcard-content">
              <div className="lp-fcard-icon">
                <MapPin size={18} />
              </div>
              <h3>{t("landing.feat1Title")}</h3>
              <p>{t("landing.feat1Desc")}</p>
            </div>
          </div>
          <div className="lp-fcard">
            <div className="lp-fcard-content">
              <div className="lp-fcard-icon">
                <Heart size={18} />
              </div>
              <h3>{t("landing.feat5Title")}</h3>
              <p>{t("landing.feat5Desc")}</p>
            </div>
          </div>
          <div className="lp-fcard">
            <div className="lp-fcard-content">
              <div className="lp-fcard-icon">
                <Flame size={18} />
              </div>
              <h3>{t("landing.feat3Title")}</h3>
              <p>{t("landing.feat3Desc")}</p>
            </div>
          </div>
          <div className="lp-fcard">
            <div className="lp-fcard-content">
              <div className="lp-fcard-icon">
                <Camera size={18} />
              </div>
              <h3>{t("landing.feat2Title")}</h3>
              <p>{t("landing.feat2Desc")}</p>
            </div>
          </div>
          <div className="lp-fcard">
            <div className="lp-fcard-content">
              <div className="lp-fcard-icon">
                <Lock size={18} />
              </div>
              <h3>{t("landing.feat4Title")}</h3>
              <p>{t("landing.feat4Desc")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Install */}
      <section className="lp-install" id="install">
        <div className="lp-install-badge">
          <span>{t("landing.proofPwa")}</span>
        </div>
        <h2>{t("landing.installTitle")}</h2>
        <p className="lp-install-desc">{t("landing.installDesc")}</p>

        <div className="lp-install-tabs">
          <button
            type="button"
            className={`lp-install-tab ${installTab === "ios" ? "active" : ""}`}
            onClick={() => setInstallTab("ios")}
          >
            iPhone / iPad
          </button>
          <button
            type="button"
            className={`lp-install-tab ${installTab === "android" ? "active" : ""}`}
            onClick={() => setInstallTab("android")}
          >
            Android
          </button>
        </div>

        <div className="lp-install-body">
          <div className="lp-install-steps">
            {installTab === "ios" ? (
              <>
                <div className="lp-step-card">
                  <span className="lp-step-num">1</span>
                  <div className="lp-step-text">
                    <svg
                      className="lp-step-svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                    </svg>
                    <strong>{t("landing.installIos1")}</strong>
                  </div>
                </div>
                <div className="lp-step-card">
                  <span className="lp-step-num">2</span>
                  <div className="lp-step-text">
                    <svg
                      className="lp-step-svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    <strong>{t("landing.installIos2")}</strong>
                  </div>
                </div>
                <div className="lp-step-card">
                  <span className="lp-step-num">3</span>
                  <div className="lp-step-text">
                    <svg
                      className="lp-step-svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    <strong>{t("landing.installIos3")}</strong>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="lp-step-card">
                  <span className="lp-step-num">1</span>
                  <div className="lp-step-text">
                    <svg
                      className="lp-step-svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="4" />
                      <line x1="21.17" y1="8" x2="12" y2="8" />
                      <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
                      <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
                    </svg>
                    <strong>{t("landing.installAndroid1")}</strong>
                  </div>
                </div>
                <div className="lp-step-card">
                  <span className="lp-step-num">2</span>
                  <div className="lp-step-text">
                    <svg
                      className="lp-step-svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                    <strong>{t("landing.installAndroid2")}</strong>
                  </div>
                </div>
                <div className="lp-step-card">
                  <span className="lp-step-num">3</span>
                  <div className="lp-step-text">
                    <svg
                      className="lp-step-svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect x="5" y="2" width="14" height="20" rx="2" />
                      <line x1="12" y1="18" x2="12.01" y2="18" />
                    </svg>
                    <strong>{t("landing.installAndroid3")}</strong>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="lp-install-demo">
            <img
              src="/icons/install-guide.png"
              alt="Install to Home Screen"
              className="lp-install-demo-img"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="lp-bottom-cta">
        <h2>{t("landing.bottomCtaTitle")}</h2>
        <p>{t("landing.bottomCtaDesc")}</p>
        <Link to="/register" className="lp-btn-primary">
          {t("landing.bottomCtaBtn")}
        </Link>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Logo size={20} />
          <span>Pinly</span>
        </div>
        <div className="lp-footer-links">
          <Link to="/privacy">{t("legal.privacy")}</Link>
          <Link to="/terms">{t("legal.terms")}</Link>
          <Link to="/login">{t("landing.login")}</Link>
        </div>
        <small>© 2026 Pinly</small>
      </footer>
    </div>
  );
}
