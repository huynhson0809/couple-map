import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getApiCache, setApiCache } from "../lib/apiCache";
import type { Couple } from "../types";

interface Stats {
  totalPins: number;
  cities: number;
  countries: number;
  cityList: string[];
  countryList: string[];
  farthestKm: number;
  daysTogether: number | null;
}

const STATS_CACHE_TTL_MS = 30_000;

const EMPTY_STATS: Stats = {
  totalPins: 0,
  cities: 0,
  countries: 0,
  cityList: [],
  countryList: [],
  farthestKm: 0,
  daysTogether: null,
};

function normalizeStats(data: Partial<Stats>): Stats {
  return {
    totalPins: data.totalPins ?? 0,
    cities: data.cities ?? 0,
    countries: data.countries ?? 0,
    cityList: data.cityList ?? [],
    countryList: data.countryList ?? [],
    farthestKm: data.farthestKm ?? 0,
    daysTogether: data.daysTogether ?? null,
  };
}

/**
 * Calls the couple-stats Edge Function which computes
 * all stats server-side in a single request.
 */
export function useStatsApi(
  coupleId: string | null | undefined,
  couple: Couple | null,
) {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const fetchStats = useCallback(async () => {
    if (!coupleId) {
      setStats(EMPTY_STATS);
      return;
    }

    const requestId = ++requestIdRef.current;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    const cacheKey = `couple-stats:${session.user.id}:${coupleId}:${couple?.anniversary_date ?? "none"}`;
    const cached = getApiCache<Stats>(cacheKey);
    if (cached) {
      setStats(cached);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke<Partial<Stats>>(
        "couple-stats",
        {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
          timeout: 8_000,
        },
      );

      if (!error && data && requestId === requestIdRef.current) {
        const nextStats = normalizeStats(data);
        setApiCache(cacheKey, nextStats, STATS_CACHE_TTL_MS);
        setStats(nextStats);
      }
    } catch {
      // silently fail
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [couple?.anniversary_date, coupleId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchStats();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}
