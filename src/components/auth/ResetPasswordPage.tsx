import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../hooks/I18nContext";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { AuthShell } from "./AuthShell";

export function ResetPasswordPage() {
  const { t } = useI18n();
  const { clearRecovery } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = "reset-password-form-error";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      clearRecovery();
      navigate("/");
    }
  }

  return (
    <AuthShell title={t("auth.resetPassword")} subtitle={t("auth.resetPasswordDesc")}>
      <form onSubmit={handleSubmit} className="auth-form">
        <TextField
          type="password"
          label={t("auth.newPassword")}
          placeholder={t("auth.newPassword")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          aria-describedby={error ? errorId : undefined}
        />
        <TextField
          type="password"
          label={t("auth.confirmPassword")}
          placeholder={t("auth.confirmPassword")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
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
          {loading ? t("auth.updating") : t("auth.updatePassword")}
        </Button>
      </form>
    </AuthShell>
  );
}
