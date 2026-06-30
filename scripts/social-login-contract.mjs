import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const useAuth = readFileSync(resolve("src/hooks/useAuth.ts"), "utf8");
const loginPage = readFileSync(resolve("src/components/auth/LoginPage.tsx"), "utf8");
const registerPage = readFileSync(resolve("src/components/auth/RegisterPage.tsx"), "utf8");
const socialLoginButton = readFileSync(
  resolve("src/components/auth/SocialLoginButton.tsx"),
  "utf8",
);
const i18n = readFileSync(resolve("src/hooks/I18nContext.tsx"), "utf8");
const css = readFileSync(resolve("src/index.css"), "utf8");

assert.equal(
  packageJson.scripts["check:social-login"],
  "node scripts/social-login-contract.mjs",
  "package.json should expose the social login contract.",
);

assert.match(
  useAuth,
  /signInWithGoogle:\s*\(\)\s*=>[\s\S]*supabase\.auth\.signInWithOAuth/,
  "useAuth should expose a Google OAuth sign-in helper.",
);
assert.match(
  useAuth,
  /provider:\s*"google"/,
  "Google OAuth helper should use the Supabase google provider.",
);
assert.match(
  useAuth,
  /redirectTo:\s*getAuthRedirectTo\(\)/,
  "Google OAuth helper should send users back to the app origin.",
);

for (const [name, file] of [
  ["LoginPage", loginPage],
  ["RegisterPage", registerPage],
]) {
  assert.match(
    file,
    /SocialLoginButton/,
    `${name} should render the shared social login button.`,
  );
  assert.match(
    file,
    /signInWithGoogle/,
    `${name} should call the Google OAuth helper.`,
  );
}

assert.match(
  socialLoginButton,
  /auth\.continueWithGoogle/,
  "Shared social login button should use localized Google copy.",
);
assert.match(
  socialLoginButton,
  /auth-social-google-mark/,
  "Shared social login button should include a Google mark.",
);
assert.match(
  socialLoginButton,
  /auth\.socialDivider/,
  "Shared social login button should include a divider before email fields.",
);

assert.match(i18n, /"auth\.continueWithGoogle": "Continue with Google"/);
assert.match(i18n, /"auth\.continueWithGoogle": "Tiếp tục với Google"/);
assert.match(i18n, /"auth\.socialDivider": "or continue with email"/);
assert.match(i18n, /"auth\.socialDivider": "hoặc tiếp tục bằng email"/);
assert.match(i18n, /"auth\.oauthError": "Could not continue with Google/);
assert.match(i18n, /"auth\.oauthError": "Không thể tiếp tục với Google/);

assert.match(css, /\.auth-social-stack/);
assert.match(css, /\.auth-social-button/);
assert.match(css, /\.auth-social-divider/);
