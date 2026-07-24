export type AuthMessageKey =
  | "auth.tooManyAttempts"
  | "auth.invalidCredentials"
  | "auth.emailNotConfirmed"
  | "auth.passwordTooShort"
  | "auth.passwordUnchanged"
  | "auth.resetLinkExpired"
  | "auth.loginError"
  | "auth.signupError"
  | "auth.emailError"
  | "auth.resendFailed"
  | "auth.oauthError";

type AuthTranslate = (key: AuthMessageKey) => string;

function rawAuthErrorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    for (const key of ["message", "error_description", "error"] as const) {
      const value = (error as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return "";
}

export function localizedAuthError(
  error: unknown,
  t: AuthTranslate,
  fallbackKey: AuthMessageKey,
) {
  const message = rawAuthErrorMessage(error).toLowerCase();

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid_credentials")
  ) {
    return t("auth.invalidCredentials");
  }
  if (message.includes("email not confirmed")) {
    return t("auth.emailNotConfirmed");
  }
  if (
    message.includes("password should be at least") ||
    message.includes("password is too short") ||
    message.includes("weak password")
  ) {
    return t("auth.passwordTooShort");
  }
  if (
    message.includes("same password") ||
    message.includes("password should be different")
  ) {
    return t("auth.passwordUnchanged");
  }
  if (
    message.includes("expired") ||
    message.includes("session missing") ||
    message.includes("recovery session")
  ) {
    return t("auth.resetLinkExpired");
  }
  if (
    message.includes("rate limit") ||
    message.includes("too many request") ||
    message.includes("over_email_send_rate_limit")
  ) {
    return t("auth.tooManyAttempts");
  }

  return t(fallbackKey);
}
