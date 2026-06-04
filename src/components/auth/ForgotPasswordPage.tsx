import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../hooks/I18nContext";
import { Button } from "../ui/Button";
import { Logo } from "../ui/Logo";
import { LangSwitch } from "../ui/LangSwitch";

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 60_000;

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempts = useRef(0);
  const lockedUntil = useRef(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (Date.now() < lockedUntil.current) {
      setError(t("auth.tooManyAttempts"));
      return;
    }
    attempts.current++;
    if (attempts.current > MAX_ATTEMPTS) {
      lockedUntil.current = Date.now() + LOCKOUT_MS;
      attempts.current = 0;
      setError(t("auth.tooManyAttempts"));
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      // Always show success to prevent email enumeration
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="auth-page">
        <div className="auth-topbar">
          <LangSwitch />
        </div>
        <div className="auth-brand">
          <Logo size={72} />
          <h1>{t("auth.resetEmailSentTitle")}</h1>
        </div>
        <p className="muted" style={{ textAlign: "center", lineHeight: 1.6 }}>
          {t("auth.resetEmailSentDesc")}
        </p>
        <p className="muted" style={{ textAlign: "center", fontWeight: 600 }}>
          {email}
        </p>
        <div className="auth-form">
          <Link to="/login">
            <Button>{t("auth.goToLogin")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-topbar">
        <LangSwitch />
      </div>
      <div className="auth-brand">
        <Logo size={72} />
        <h1>{t("auth.forgotPassword")}</h1>
      </div>
      <p className="muted">{t("auth.forgotPasswordDesc")}</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="email"
          placeholder={t("auth.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        {error && <p className="error">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? t("auth.sending") : t("auth.sendResetLink")}
        </Button>
      </form>
      <p className="muted">
        <Link to="/login">{t("auth.backToLogin")}</Link>
      </p>
    </div>
  );
}
