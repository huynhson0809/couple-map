import { useCallback, useEffect, useState } from "react";
import type { Session, User as SupaUser } from "@supabase/supabase-js";
import type { ConsentPayload } from "../lib/privacyConsent";
import { supabase } from "../lib/supabase";

const RECOVERY_KEY = "pinly_password_recovery";

function getAuthRedirectTo() {
  return typeof window === "undefined" ? undefined : window.location.origin;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(
    () => sessionStorage.getItem(RECOVERY_KEY) === "1",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadValidatedSession() {
      const { data } = await supabase.auth.getSession();
      const cachedSession = data.session;

      if (!cachedSession) {
        if (!cancelled) {
          setSession(null);
          setUser(null);
          setLoading(false);
        }
        return;
      }

      const { data: userData, error } = await supabase.auth.getUser();
      const validatedUser = userData.user ?? null;

      if (cancelled) return;

      if (error || !validatedUser) {
        await supabase.auth.signOut({ scope: "local" });
        if (!cancelled) {
          sessionStorage.removeItem(RECOVERY_KEY);
          setSession(null);
          setUser(null);
          setIsRecovery(false);
          setLoading(false);
        }
        return;
      }

      setSession(cachedSession);
      setUser(validatedUser);
      setLoading(false);
    }

    void loadValidatedSession();

    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (evt === "PASSWORD_RECOVERY") {
        sessionStorage.setItem(RECOVERY_KEY, "1");
        setIsRecovery(true);
      } else if (evt === "SIGNED_OUT") {
        sessionStorage.removeItem(RECOVERY_KEY);
        setIsRecovery(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const clearRecovery = useCallback(() => {
    sessionStorage.removeItem(RECOVERY_KEY);
    setIsRecovery(false);
    window.dispatchEvent(new Event("pinly_recovery_cleared"));
  }, []);

  useEffect(() => {
    const handler = () => setIsRecovery(false);
    window.addEventListener("pinly_recovery_cleared", handler);
    return () => window.removeEventListener("pinly_recovery_cleared", handler);
  }, []);

  return {
    session,
    user,
    loading,
    isRecovery,
    clearRecovery,
    signUp: async (
      email: string,
      password: string,
      displayName?: string,
      consent?: ConsentPayload,
    ) => {
      const res = await supabase.functions.invoke("secure-signup", {
        body: {
          email,
          password,
          display_name: displayName,
          redirect_to: window.location.origin,
          consent,
        },
      });
      if (res.error) {
        return { data: null, error: res.error };
      }
      const body = res.data as { success?: boolean; error?: string };
      if (body?.error) {
        return { data: null, error: { message: body.error } };
      }
      return { data: { success: true }, error: null };
    },
    signIn: (email: string, password: string) =>
      supabase.auth.signInWithPassword({ email, password }),
    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthRedirectTo(),
        },
      }),
    signOut: () => supabase.auth.signOut(),
  };
}
