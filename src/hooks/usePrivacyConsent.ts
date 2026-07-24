import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildExistingUserConsent,
  isCurrentConsent,
  type UserConsentRow,
} from "../lib/privacyConsent";
import { supabase } from "../lib/supabase";

const CONSENT_CACHE_PREFIX = "pinly.privacyConsent.";

function getCachedCurrentConsent(userId: string | null | undefined) {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${CONSENT_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const consent = JSON.parse(raw) as UserConsentRow;
    return isCurrentConsent(consent) ? consent : null;
  } catch {
    return null;
  }
}

function cacheConsent(userId: string, consent: UserConsentRow | null) {
  if (typeof window === "undefined") return;
  const key = `${CONSENT_CACHE_PREFIX}${userId}`;
  if (consent && isCurrentConsent(consent)) {
    window.localStorage.setItem(key, JSON.stringify(consent));
  } else {
    window.localStorage.removeItem(key);
  }
}

export function usePrivacyConsent(userId: string | null | undefined) {
  const [latestConsent, setLatestConsent] = useState<UserConsentRow | null>(
    () => getCachedCurrentConsent(userId),
  );
  const [loading, setLoading] = useState(Boolean(userId));
  const [checked, setChecked] = useState(!userId);
  const [error, setError] = useState<string | null>(null);
  const [payloadUserId, setPayloadUserId] = useState(userId ?? undefined);
  const requestIdRef = useRef(0);

  const reloadConsent = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!userId) {
      setLatestConsent(null);
      setPayloadUserId(undefined);
      setLoading(false);
      setChecked(true);
      setError(null);
      return;
    }

    const cachedConsent = getCachedCurrentConsent(userId);
    setPayloadUserId(userId);
    setLatestConsent(cachedConsent);

    setLoading(true);
    setChecked(false);
    setError(null);

    const { data, error: queryError } = await supabase
      .from("user_consents")
      .select(
        "id,user_id,terms_version,privacy_version,accepted_at,source,created_at",
      )
      .eq("user_id", userId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (requestId !== requestIdRef.current) return;

    if (queryError) {
      console.error("Could not load privacy consent:", queryError);
      setError("consent_load_failed");
      setChecked(false);
    } else {
      const nextConsent = (data as UserConsentRow | null) ?? null;
      setLatestConsent(nextConsent);
      cacheConsent(userId, nextConsent);
      setChecked(true);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadConsent();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [reloadConsent]);

  const acceptLatestConsent = useCallback(async () => {
    if (!userId) throw new Error("Missing user");

    // buildExistingUserConsent supplies the existing_user_gate source.
    const consent = buildExistingUserConsent();
    const { error: insertError } = await supabase.from("user_consents").insert({
      user_id: userId,
      terms_version: consent.terms_version,
      privacy_version: consent.privacy_version,
      source: consent.source,
    });

    if (insertError) throw insertError;

    await reloadConsent();
  }, [reloadConsent, userId]);

  const payloadMatchesUser = payloadUserId === (userId ?? undefined);
  const scopedConsent = payloadMatchesUser ? latestConsent : null;

  return {
    latestConsent: scopedConsent,
    loading: userId ? loading || !payloadMatchesUser : false,
    checked: payloadMatchesUser ? checked : false,
    error: payloadMatchesUser ? error : null,
    hasCurrentConsent: payloadMatchesUser && isCurrentConsent(scopedConsent),
    acceptLatestConsent,
    reloadConsent,
  };
}
