import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../hooks/I18nContext";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { AuthShell } from "./AuthShell";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000; // 1 minute

export function RegisterPage() {
  const { signUp } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const attempts = useRef(0);
  const lockedUntil = useRef(0);
  const errorId = "register-form-error";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Client-side rate limiting
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

    const { error } = await signUp(email, password, displayName || undefined);
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      // Always show "check your email" regardless of whether email already exists
      // This prevents email enumeration attacks
      setRegistered(true);
    }
  }

  if (registered) {
    return (
      <AuthShell
        title={t("auth.checkEmailTitle")}
        subtitle={t("auth.checkEmailDesc")}
        success
      >
        <div className="auth-check-email">
          <p className="auth-email-pill">{email}</p>
          <div className="auth-action-stack">
            <ResendButton email={email} />
            <Link
              to="/login"
              className="btn lg-button lg-button-secondary lg-button-size-md lg-button-tone-neutral auth-action"
            >
              <span className="lg-button-label">{t("auth.goToLogin")}</span>
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.createAccount")}
      subtitle={t("auth.startMapping")}
      footer={
        <p className="muted">
          {t("auth.haveAccount")} <Link to="/login">{t("auth.signin")}</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <TextField
          type="text"
          label={t("auth.name")}
          placeholder={t("auth.name")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
          aria-describedby={error ? errorId : undefined}
        />
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
        <TextField
          type="password"
          label={t("auth.password")}
          placeholder={t("auth.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} className="auth-error" role="alert" aria-live="assertive">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} size="lg" className="auth-submit">
          {loading ? t("auth.creating") : t("auth.signup")}
        </Button>
      </form>
    </AuthShell>
  );
}

function ResendButton({ email }: { email: string }) {
  const { t } = useI18n();
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  async function handleResend() {
    if (cooldown > 0 || sending) return;
    setSending(true);
    await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    setSent(true);
    setCooldown(60);
    timer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timer.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  return (
    <Button
      type="button"
      onClick={handleResend}
      disabled={cooldown > 0}
      loading={sending}
      variant="secondary"
      className="auth-action"
    >
      {sent && cooldown > 0
        ? `${t("auth.resendIn")} ${cooldown}s`
        : t("auth.resendEmail")}
    </Button>
  );
}
