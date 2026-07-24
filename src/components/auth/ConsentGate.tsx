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
  if (consent.checked && consent.hasCurrentConsent) return <>{children}</>;

  const loadFailed = !consent.checked && Boolean(consent.error);
  const checking = !consent.checked && consent.loading;

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      await consent.acceptLatestConsent();
    } catch {
      setError(t("legal.consentSaveError"));
    } finally {
      setAccepting(false);
    }
  }

  async function handleRetry() {
    setAccepting(true);
    setError(null);
    try {
      await consent.reloadConsent();
    } finally {
      setAccepting(false);
    }
  }

  return (
    <main className="auth-page auth-shell consent-gate">
      <div className="auth-material" aria-hidden="true" />
      <div className="auth-layout">
        <section className="auth-brand" aria-label="Pinly">
          <Logo size={76} />
          <div className="auth-brand-copy">
            <p className="auth-kicker">Pinly</p>
            <h1>{t("legal.consentGateTitle")}</h1>
          </div>
        </section>

        <div className="auth-panel">
          <GlassSurface level="section" className="auth-card consent-card">
            <div className="consent-icon" aria-hidden="true">
              <ShieldCheck size={24} />
            </div>
            <p>
              {checking
                ? t("legal.loadingConsent")
                : loadFailed
                  ? t("legal.consentLoadError")
                  : t("legal.consentGateDesc")}
            </p>
            {!checking && !loadFailed && (
              <>
                <p className="muted small">{t("legal.mediaDisclosureShort")}</p>
                <p className="consent-links">
                  <Link to="/terms">{t("legal.terms")}</Link>
                  <span aria-hidden="true">/</span>
                  <Link to="/privacy">{t("legal.privacy")}</Link>
                </p>
              </>
            )}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <Button
              type="button"
              size="lg"
              loading={accepting || checking}
              disabled={checking}
              onClick={loadFailed ? handleRetry : handleAccept}
            >
              {loadFailed ? t("common.retry") : t("legal.acceptAndContinue")}
            </Button>
          </GlassSurface>
        </div>
      </div>
    </main>
  );
}
