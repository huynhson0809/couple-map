import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { getApiCache, setApiCache } from "../lib/apiCache";
import type { Couple } from "../types";
import { normalizeCityName, normalizeCountryName } from "../lib/locationNames";

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
  const countryList = Array.from(
    new Set(
      (data.countryList ?? [])
        .map((country) => normalizeCountryName(country))
      .filter((country): country is string => Boolean(country)),
    ),
  );
  const cityCountryContext =
    countryList.length === 1
      ? countryList[0]
      : countryList.length > 1
        ? "__multiple_countries__"
        : undefined;
  const cityList = Array.from(
    new Set(
      (data.cityList ?? [])
        .map((city) => normalizeCityName(city, cityCountryContext))
        .filter((city): city is string => Boolean(city)),
    ),
  );

  return {
    totalPins: data.totalPins ?? 0,
    cities: cityList.length,
    countries: countryList.length,
    cityList,
    countryList,
    farthestKm: data.farthestKm ?? 0,
    daysTogether: data.daysTogether ?? null,
  };
}

/**
 * Calls the couple-stats Edge Function which computes
 * all stats server-side in a single request.
 */
export function useStatsApi(
  spaceId: string | null | undefined,
  couple: Couple | null,
) {
  const [snapshot, setSnapshot] = useState<{
    spaceId: string | null;
    stats: Stats;
    loading: boolean;
  }>(() => ({
    spaceId: spaceId ?? null,
    stats: EMPTY_STATS,
    loading: Boolean(spaceId),
  }));
  const requestIdRef = useRef(0);
  const activeSpaceIdRef = useRef(spaceId);
  const payloadMatchesSpace = snapshot.spaceId === (spaceId ?? null);
  const stats = payloadMatchesSpace ? snapshot.stats : EMPTY_STATS;
  const loading = payloadMatchesSpace ? snapshot.loading : Boolean(spaceId);

  useLayoutEffect(() => {
    activeSpaceIdRef.current = spaceId;
    requestIdRef.current += 1;
  }, [spaceId]);

  const fetchStats = useCallback(async () => {
    if (!spaceId) {
      setSnapshot({ spaceId: null, stats: EMPTY_STATS, loading: false });
      return;
    }

    const targetSpaceId = spaceId;
    const requestId = ++requestIdRef.current;
    setSnapshot((current) => ({
      spaceId: targetSpaceId,
      stats: current.spaceId === targetSpaceId ? current.stats : EMPTY_STATS,
      loading: true,
    }));

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (
      requestId !== requestIdRef.current ||
      activeSpaceIdRef.current !== targetSpaceId
    ) return;
    if (!session?.access_token) {
      setSnapshot({
        spaceId: targetSpaceId,
        stats: EMPTY_STATS,
        loading: false,
      });
      return;
    }

    const cacheKey = `space-stats:v4:${session.user.id}:${targetSpaceId}:${couple?.anniversary_date ?? "none"}`;
    const cached = getApiCache<Stats>(cacheKey);
    if (cached) {
      setSnapshot({
        spaceId: targetSpaceId,
        stats: cached,
        loading: false,
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke<Partial<Stats>>(
        "couple-stats",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "X-Pinly-Space-Id": targetSpaceId,
          },
          timeout: 8_000,
        },
      );

      if (error) {
        console.error("Failed to load space stats:", error);
      } else if (
        data &&
        requestId === requestIdRef.current &&
        activeSpaceIdRef.current === targetSpaceId
      ) {
        const nextStats = normalizeStats(data);
        setApiCache(cacheKey, nextStats, STATS_CACHE_TTL_MS);
        setSnapshot({
          spaceId: targetSpaceId,
          stats: nextStats,
          loading: false,
        });
      }
    } catch (fetchError) {
      console.error("Failed to load space stats:", fetchError);
    } finally {
      if (
        requestId === requestIdRef.current &&
        activeSpaceIdRef.current === targetSpaceId
      ) {
        setSnapshot((current) =>
          current.spaceId === targetSpaceId
            ? { ...current, loading: false }
            : current,
        );
      }
    }
  }, [couple?.anniversary_date, spaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchStats();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}
