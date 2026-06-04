import { useCallback, useEffect, useState } from "react";
import type { Session, User as SupaUser } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

const RECOVERY_KEY = "pinly_password_recovery";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(
    () => sessionStorage.getItem(RECOVERY_KEY) === "1",
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (evt === "PASSWORD_RECOVERY") {
        sessionStorage.setItem(RECOVERY_KEY, "1");
        setIsRecovery(true);
      }
    });
    return () => sub.subscription.unsubscribe();
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
    signUp: async (email: string, password: string, displayName?: string) => {
      const res = await supabase.functions.invoke("secure-signup", {
        body: {
          email,
          password,
          display_name: displayName,
          redirect_to: window.location.origin,
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
    signOut: () => supabase.auth.signOut(),
  };
}
