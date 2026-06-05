import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../hooks/I18nContext";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { AuthShell } from "./AuthShell";

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
  const errorId = "forgot-password-form-error";

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
      <AuthShell
        title={t("auth.resetEmailSentTitle")}
        subtitle={t("auth.resetEmailSentDesc")}
        success
      >
        <div className="auth-check-email">
          <p className="auth-email-pill">{email}</p>
          <Link
            to="/login"
            className="btn lg-button lg-button-secondary lg-button-size-md lg-button-tone-neutral auth-action"
          >
            <span className="lg-button-label">{t("auth.goToLogin")}</span>
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.forgotPassword")}
      subtitle={t("auth.forgotPasswordDesc")}
      footer={
        <p className="muted">
          <Link to="/login">{t("auth.backToLogin")}</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <TextField
          type="email"
          label={t("auth.email")}
          placeholder={t("auth.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} className="auth-error" role="alert" aria-live="assertive">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} size="lg" className="auth-submit">
          {loading ? t("auth.sending") : t("auth.sendResetLink")}
        </Button>
      </form>
    </AuthShell>
  );
}
