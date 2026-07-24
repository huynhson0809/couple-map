import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface AdminAccessState {
  userId: string | undefined;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
}

export function useAdminAccess(userId?: string) {
  const [state, setState] = useState<AdminAccessState>(() => ({
    userId,
    isAdmin: false,
    loading: Boolean(userId),
    error: null,
  }));

  useEffect(() => {
    if (!userId) return;
    let active = true;

    void supabase.rpc("is_pinly_admin").then(({ data, error }) => {
      if (!active) return;
      if (error) console.error("Could not verify admin access:", error);
      setState({
        userId,
        isAdmin: !error && data === true,
        loading: false,
        error: error ? "admin_access_check_failed" : null,
      });
    });

    return () => {
      active = false;
    };
  }, [userId]);

  if (state.userId !== userId) {
    return {
      userId,
      isAdmin: false,
      loading: Boolean(userId),
      error: null,
    };
  }

  return state;
}
