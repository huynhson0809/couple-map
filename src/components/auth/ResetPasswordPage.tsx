import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../hooks/I18nContext";
import { Button } from "../ui/Button";
import { Logo } from "../ui/Logo";
import { LangSwitch } from "../ui/LangSwitch";

export function ResetPasswordPage() {
  const { t } = useI18n();
  const { clearRecovery } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="auth-page">
      <div className="auth-topbar">
        <LangSwitch />
      </div>
      <div className="auth-brand">
        <Logo size={72} />
        <h1>{t("auth.resetPassword")}</h1>
      </div>
      <p className="muted">{t("auth.resetPasswordDesc")}</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="password"
          placeholder={t("auth.newPassword")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder={t("auth.confirmPassword")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
        {error && <p className="error">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? t("auth.updating") : t("auth.updatePassword")}
        </Button>
      </form>
    </div>
  );
}
