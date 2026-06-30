import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../hooks/I18nContext";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { AuthShell } from "./AuthShell";
import { SocialLoginButton } from "./SocialLoginButton";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000; // 1 minute

export function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const attempts = useRef(0);
  const lockedUntil = useRef(0);
  const errorId = "login-form-error";

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
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) setError(error.message);
    else navigate("/");
  }

  return (
    <AuthShell
      title="Pinly"
      subtitle={t("auth.welcome")}
      footer={
        <>
          <p className="muted">
            <Link to="/forgot-password">{t("auth.forgotPassword")}</Link>
          </p>
          <p className="muted">
            {t("auth.noAccount")} <Link to="/register">{t("auth.signup")}</Link>
          </p>
        </>
      }
    >
      <SocialLoginButton
        onGoogle={signInWithGoogle}
        errorId={error ? errorId : undefined}
        onError={(message) => setError(message || null)}
      />
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
        <TextField
          type="password"
          label={t("auth.password")}
          placeholder={t("auth.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} className="auth-error" role="alert" aria-live="assertive">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} size="lg" className="auth-submit">
          {loading ? t("auth.signingIn") : t("auth.signin")}
        </Button>
      </form>
    </AuthShell>
  );
}
