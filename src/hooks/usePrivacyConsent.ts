import { useCallback, useEffect, useState } from "react";
import {
  buildExistingUserConsent,
  isCurrentConsent,
  type UserConsentRow,
} from "../lib/privacyConsent";
import { supabase } from "../lib/supabase";

export function usePrivacyConsent(userId: string | null | undefined) {
  const [latestConsent, setLatestConsent] = useState<UserConsentRow | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  const reloadConsent = useCallback(async () => {
    if (!userId) {
      setLatestConsent(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
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

    if (queryError) {
      setError(queryError.message);
      setLatestConsent(null);
    } else {
      setLatestConsent((data as UserConsentRow | null) ?? null);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadConsent();
    }, 0);
    return () => window.clearTimeout(timer);
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

  return {
    latestConsent,
    loading,
    error,
    hasCurrentConsent: isCurrentConsent(latestConsent),
    acceptLatestConsent,
    reloadConsent,
  };
}
