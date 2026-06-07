export const TERMS_VERSION = "2026-06-07";
export const PRIVACY_VERSION = "2026-06-07";
export const LEGAL_EFFECTIVE_DATE = "June 7, 2026";

export const CONSENT_SOURCE_SIGNUP = "signup";
export const CONSENT_SOURCE_EXISTING_USER_GATE = "existing_user_gate";

export type ConsentSource =
  | typeof CONSENT_SOURCE_SIGNUP
  | typeof CONSENT_SOURCE_EXISTING_USER_GATE;

export interface ConsentPayload {
  terms_version: string;
  privacy_version: string;
  source: ConsentSource;
}

export interface UserConsentRow {
  id: string;
  user_id: string;
  terms_version: string;
  privacy_version: string;
  accepted_at: string;
  source: ConsentSource;
  created_at: string;
}

export function buildSignupConsent(): ConsentPayload {
  return {
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    source: CONSENT_SOURCE_SIGNUP,
  };
}

export function buildExistingUserConsent(): ConsentPayload {
  return {
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    source: CONSENT_SOURCE_EXISTING_USER_GATE,
  };
}

export function isCurrentConsent(
  consent: Pick<UserConsentRow, "terms_version" | "privacy_version"> | null | undefined,
): boolean {
  return (
    consent?.terms_version === TERMS_VERSION &&
    consent?.privacy_version === PRIVACY_VERSION
  );
}
