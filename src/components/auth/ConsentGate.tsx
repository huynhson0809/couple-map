import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "../../hooks/I18nContext";
import { usePrivacyConsent } from "../../hooks/usePrivacyConsent";
import { Button } from "../ui/Button";
import { GlassSurface } from "../ui/GlassSurface";
import { Logo } from "../ui/Logo";

interface Props {
  userId: string;
  children: ReactNode;
}

export function ConsentGate({ userId, children }: Props) {
  const { t } = useI18n();
  const consent = usePrivacyConsent(userId);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (consent.loading) {
    return (
      <div className="full-center app-status-screen">
        <div className="app-status-card">
          <Logo size={44} />
          <h2>{t("legal.loadingConsent")}</h2>
        </div>
      </div>
    );
  }

  if (consent.hasCurrentConsent) return <>{children}</>;

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      await consent.acceptLatestConsent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <main className="auth-page auth-shell consent-gate">
      <div className="auth-material" aria-hidden="true" />
      <section className="auth-brand" aria-label="Pinly">
        <Logo size={76} />
        <div className="auth-brand-copy">
          <p className="auth-kicker">Pinly</p>
          <h1>{t("legal.consentGateTitle")}</h1>
        </div>
      </section>

      <GlassSurface level="section" className="auth-card consent-card">
        <div className="consent-icon" aria-hidden="true">
          <ShieldCheck size={24} />
        </div>
        <p>{t("legal.consentGateDesc")}</p>
        <p className="muted small">{t("legal.mediaDisclosureShort")}</p>
        <p className="consent-links">
          <Link to="/terms">{t("legal.terms")}</Link>
          <span aria-hidden="true">/</span>
          <Link to="/privacy">{t("legal.privacy")}</Link>
        </p>
        {(error || consent.error) && (
          <p className="auth-error" role="alert">
            {error || consent.error}
          </p>
        )}
        <Button
          type="button"
          size="lg"
          loading={accepting}
          onClick={handleAccept}
        >
          {t("legal.acceptAndContinue")}
        </Button>
      </GlassSurface>
    </main>
  );
}
