import { useState } from "react";
import { useI18n } from "../../hooks/I18nContext";

interface SocialLoginButtonProps {
  onGoogle: () => Promise<{ error?: { message?: string } | null }>;
  errorId?: string;
  onError: (message: string) => void;
}

export function SocialLoginButton({
  onGoogle,
  errorId,
  onError,
}: SocialLoginButtonProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    if (loading) return;
    setLoading(true);
    onError("");

    const { error } = await onGoogle();
    if (error) {
      setLoading(false);
      onError(error.message || t("auth.oauthError"));
    }
  }

  return (
    <div className="auth-social-stack">
      <button
        type="button"
        className="auth-social-button"
        onClick={handleGoogleLogin}
        disabled={loading}
        aria-describedby={errorId}
      >
        <span className="auth-social-google-mark" aria-hidden="true">
          G
        </span>
        <span>{loading ? t("auth.redirecting") : t("auth.continueWithGoogle")}</span>
      </button>
      <div className="auth-social-divider" role="separator">
        <span>{t("auth.socialDivider")}</span>
      </div>
    </div>
  );
}
