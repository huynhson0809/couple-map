import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "../../hooks/I18nContext";
import { getLegalContent, type PolicyKind } from "../../lib/legalContent";
import { Button } from "../ui/Button";
import { GlassSurface } from "../ui/GlassSurface";
import { LangSwitch } from "../ui/LangSwitch";

interface Props {
  kind: PolicyKind;
}

export function PolicyPage({ kind }: Props) {
  const { lang, t } = useI18n();
  const navigate = useNavigate();
  const content = getLegalContent(kind, lang);

  return (
    <main className="legal-page">
      <div className="auth-material" aria-hidden="true" />
      <div className="legal-topbar">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leadingIcon={<ChevronLeft size={16} />}
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate("/login");
          }}
        >
          {t("legal.back")}
        </Button>
        <LangSwitch />
      </div>

      <GlassSurface level="section" className="legal-card">
        <p className="legal-kicker">Pinly</p>
        <h1>{content.title}</h1>
        <p className="legal-effective">
          {t("legal.effectiveDate")}: {content.effectiveDate}
        </p>
        <p className="legal-summary">{content.summary}</p>

        <div className="legal-sections">
          {content.sections.map((section) => (
            <section key={section.title} className="legal-section">
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <div className="legal-links">
          <Link to="/privacy">{t("legal.privacy")}</Link>
          <Link to="/terms">{t("legal.terms")}</Link>
        </div>
      </GlassSurface>
    </main>
  );
}
