import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface AdminAccessState {
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
}

export function useAdminAccess(userId?: string) {
  const [state, setState] = useState<AdminAccessState>(() => ({
    isAdmin: false,
    loading: Boolean(userId),
    error: null,
  }));

  useEffect(() => {
    if (!userId) return;
    let active = true;

    void supabase.rpc("is_pinly_admin").then(({ data, error }) => {
      if (!active) return;
      setState({
        isAdmin: !error && data === true,
        loading: false,
        error: error?.message ?? null,
      });
    });

    return () => {
      active = false;
    };
  }, [userId]);

  return state;
}

