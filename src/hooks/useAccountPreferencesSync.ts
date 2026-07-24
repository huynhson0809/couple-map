import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import {
  detectUserTimeZone,
  isSupportedLocale,
} from "../lib/userPreferences";
import { useI18n } from "./I18nContext";

type UserPreferencesRow = {
  locale: string | null;
  timezone: string | null;
  timezone_confirmed: boolean;
};

async function syncCurrentAuthPreferences(
  userId: string,
  locale: string,
  timezone: string,
) {
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== userId) return error;

  const metadata = data.user.user_metadata ?? {};
  if (metadata.locale === locale && metadata.timezone === timezone) {
    return null;
  }

  const { error: updateError } = await supabase.auth.updateUser({
    data: { locale, timezone },
  });
  return updateError;
}

export function useAccountPreferencesSync(userId: string | undefined) {
  const { lang, setLangFromAccount } = useI18n();
  const loadedUserIdRef = useRef<string | null>(null);
  const databasePreferencesRef = useRef<UserPreferencesRow | null>(null);
  const currentLangRef = useRef(lang);

  useEffect(() => {
    currentLangRef.current = lang;
  }, [lang]);

  useEffect(() => {
    loadedUserIdRef.current = null;
    databasePreferencesRef.current = null;
    if (!userId) return;
    const targetUserId = userId;

    let cancelled = false;

    async function loadPreferences() {
      const { data, error } = await supabase
        .from("users")
        .select("locale, timezone, timezone_confirmed")
        .eq("id", targetUserId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("Could not load account preferences:", error);
        return;
      }

      const preferences = (data as UserPreferencesRow | null) ?? {
        locale: null,
        timezone: null,
        timezone_confirmed: false,
      };
      databasePreferencesRef.current = preferences;
      loadedUserIdRef.current = targetUserId;

      const nextLocale = isSupportedLocale(preferences.locale)
        ? preferences.locale
        : currentLangRef.current;
      if (nextLocale !== currentLangRef.current) {
        setLangFromAccount(nextLocale);
      }

      const timezone = detectUserTimeZone();

      if (
        preferences.locale !== nextLocale ||
        preferences.timezone !== timezone ||
        !preferences.timezone_confirmed
      ) {
        const { error: updateError } = await supabase
          .from("users")
          .update({
            locale: nextLocale,
            timezone,
            timezone_confirmed: true,
          })
          .eq("id", targetUserId);

        if (!cancelled && !updateError) {
          databasePreferencesRef.current = {
            locale: nextLocale,
            timezone,
            timezone_confirmed: true,
          };
        }
      }

      const authUpdateError = await syncCurrentAuthPreferences(
        targetUserId,
        nextLocale,
        timezone,
      );
      if (!cancelled && authUpdateError) {
        console.error(
          "Could not sync account preferences to Auth metadata:",
          authUpdateError,
        );
      }
    }

    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [setLangFromAccount, userId]);

  useEffect(() => {
    if (!userId || loadedUserIdRef.current !== userId) return;
    const preferences = databasePreferencesRef.current;
    if (!preferences || preferences.locale === lang) return;

    let cancelled = false;
    const timezone = preferences.timezone || detectUserTimeZone();
    void supabase
      .from("users")
      .update({ locale: lang })
      .eq("id", userId)
      .then(async ({ error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Could not update account locale:", error);
          return;
        }

        if (!cancelled && !error && databasePreferencesRef.current) {
          databasePreferencesRef.current.locale = lang;
        }

        const authUpdateError = await syncCurrentAuthPreferences(
          userId,
          lang,
          timezone,
        );
        if (!cancelled && authUpdateError) {
          console.error(
            "Could not sync account locale to Auth metadata:",
            authUpdateError,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lang, userId]);
}
