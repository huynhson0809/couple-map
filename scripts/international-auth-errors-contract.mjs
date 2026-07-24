import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localizedAuthError } from "../src/lib/authErrorMessage.ts";

const messages = {
  "auth.tooManyAttempts": "rate",
  "auth.invalidCredentials": "credentials",
  "auth.emailNotConfirmed": "confirm",
  "auth.passwordTooShort": "short",
  "auth.passwordUnchanged": "same",
  "auth.resetLinkExpired": "expired",
  "auth.loginError": "login fallback",
  "auth.signupError": "signup fallback",
  "auth.emailError": "email fallback",
  "auth.resendFailed": "resend fallback",
  "auth.oauthError": "oauth fallback",
};
const t = (key) => messages[key];

assert.equal(
  localizedAuthError(
    new Error("Invalid login credentials"),
    t,
    "auth.loginError",
  ),
  "credentials",
);
assert.equal(
  localizedAuthError(
    { message: "Email not confirmed" },
    t,
    "auth.loginError",
  ),
  "confirm",
);
assert.equal(
  localizedAuthError(
    "Password should be at least 6 characters",
    t,
    "auth.signupError",
  ),
  "short",
);
assert.equal(
  localizedAuthError("internal provider detail", t, "auth.loginError"),
  "login fallback",
  "Unknown provider errors must not leak raw backend text.",
);

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

for (const path of [
  "src/components/auth/LoginPage.tsx",
  "src/components/auth/RegisterPage.tsx",
  "src/components/auth/ForgotPasswordPage.tsx",
  "src/components/auth/ResetPasswordPage.tsx",
  "src/components/auth/SocialLoginButton.tsx",
]) {
  const source = readProjectFile(path);
  assert.match(source, /localizedAuthError/);
  assert.doesNotMatch(source, /setError\(error\.message\)/);
}

const register = readProjectFile("src/components/auth/RegisterPage.tsx");
assert.match(register, /if \(resendError\)/);
assert.match(register, /setError\(localizedAuthError\(resendError/);

const preferenceSync = readProjectFile(
  "src/hooks/useAccountPreferencesSync.ts",
);
assert.match(preferenceSync, /supabase\.auth\.updateUser/);
assert.match(preferenceSync, /data:\s*\{\s*locale,\s*timezone\s*\}/);

for (const path of [
  "supabase/templates/confirmation.html",
  "supabase/templates/recovery.html",
]) {
  const template = readProjectFile(path);
  assert.match(template, /\{\{\s*if eq \.Data\.locale "vi"\s*\}\}/);
  assert.match(template, /\{\{\s*\.ConfirmationURL\s*\}\}/);
  assert.match(template, /\{\{\s*else\s*\}\}/);
  assert.match(template, /lang="en"/);
}

console.log("international auth errors contract: ok");
