import { CalendarDays, FileText, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import {
  PublicSiteFooter,
  PublicSiteHeader,
} from "../components/public/PublicSiteChrome";
import { useI18n } from "../hooks/I18nContext";
import { usePublicPolicySeo } from "../hooks/usePublicPolicySeo";
import { getLegalContent, type PolicyKind } from "../lib/legalContent";
import "./PublicContentPage.css";
import "./PublicPolicyPage.css";

const POLICY_LABELS = {
  vi: {
    eyebrow: "Thông tin pháp lý",
    effectiveDate: "Có hiệu lực từ",
    contents: "Trong trang này",
    related: "Tài liệu liên quan",
    privacy: "Chính sách quyền riêng tư",
    terms: "Điều khoản sử dụng",
  },
  en: {
    eyebrow: "Legal information",
    effectiveDate: "Effective from",
    contents: "On this page",
    related: "Related documents",
    privacy: "Privacy Policy",
    terms: "Terms of Use",
  },
} as const;

export function PublicPolicyPage({ kind }: { kind: PolicyKind }) {
  const { lang } = useI18n();
  const content = getLegalContent(kind, lang);
  const labels = POLICY_LABELS[lang];
  const PolicyIcon = kind === "privacy" ? ShieldCheck : FileText;

  usePublicPolicySeo(kind, lang);

  return (
    <div className="public-page public-policy-page">
      <PublicSiteHeader />

      <main>
        <section className="public-policy-hero">
          <div className="public-content-width public-policy-hero-inner">
            <span className="public-eyebrow">
              <PolicyIcon size={18} aria-hidden="true" />
              {labels.eyebrow}
            </span>
            <h1>{content.title}</h1>
            <p>{content.summary}</p>
            <div className="public-policy-effective">
              <CalendarDays size={18} aria-hidden="true" />
              <span>{labels.effectiveDate}</span>
              <time>{content.effectiveDate}</time>
            </div>
          </div>
        </section>

        <section className="public-policy-body">
          <div className="public-content-width public-policy-layout">
            <aside className="public-policy-toc">
              <strong>{labels.contents}</strong>
              <nav aria-label={labels.contents}>
                {content.sections.map((section, index) => (
                  <a href={`#policy-section-${index + 1}`} key={section.title}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {section.title}
                  </a>
                ))}
              </nav>
            </aside>

            <article className="public-policy-article">
              {content.sections.map((section, index) => (
                <section
                  id={`policy-section-${index + 1}`}
                  className="public-policy-section"
                  key={section.title}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h2>{section.title}</h2>
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </article>
          </div>
        </section>

        <section
          className="public-policy-related"
          aria-labelledby="legal-related"
        >
          <div className="public-content-width public-policy-related-inner">
            <h2 id="legal-related">{labels.related}</h2>
            <nav aria-label={labels.related}>
              <Link
                to="/privacy"
                aria-current={kind === "privacy" ? "page" : undefined}
              >
                <ShieldCheck size={20} aria-hidden="true" />
                {labels.privacy}
              </Link>
              <Link
                to="/terms"
                aria-current={kind === "terms" ? "page" : undefined}
              >
                <FileText size={20} aria-hidden="true" />
                {labels.terms}
              </Link>
            </nav>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
