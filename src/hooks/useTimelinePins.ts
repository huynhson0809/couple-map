import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Pin } from "../types";

const PAGE_SIZE = 24;

export interface TimelinePinFilters {
  categoryIds: string[];
  favoriteOnly: boolean;
  dateFrom: string;
  dateTo: string;
  creatorId: string;
  address: string;
}

function cleanSearch(value: string) {
  return value.trim().replace(/[,%]/g, " ").replace(/\s+/g, " ");
}

function applyFilters(
  query: ReturnType<typeof supabase.from>,
  coupleId: string,
  filters: TimelinePinFilters,
  count: "exact" | undefined,
) {
  let next = query
    .select("*, images:pin_images(*)", { count })
    .eq("couple_id", coupleId)
    .order("created_at", { ascending: false })
    .order("sort_order", { referencedTable: "pin_images", ascending: true });

  if (filters.favoriteOnly && filters.categoryIds.length > 0) {
    const categoryList = filters.categoryIds
      .map((id) => `"${id.replace(/"/g, '\\"')}"`)
      .join(",");
    next = next.or(`is_favorite.eq.true,category.in.(${categoryList})`);
  } else if (filters.favoriteOnly) {
    next = next.eq("is_favorite", true);
  } else if (filters.categoryIds.length > 0) {
    next = next.in("category", filters.categoryIds);
  }

  if (filters.dateFrom) {
    next = next.gte("created_at", `${filters.dateFrom}T00:00:00`);
  }

  if (filters.dateTo) {
    next = next.lte("created_at", `${filters.dateTo}T23:59:59.999`);
  }

  if (filters.creatorId !== "all") {
    next = next.eq("created_by", filters.creatorId);
  }

  const address = cleanSearch(filters.address);
  if (address) {
    next = next.or(
      `address.ilike.%${address}%,city.ilike.%${address}%,country.ilike.%${address}%`,
    );
  }

  return next;
}

export function useTimelinePins(
  coupleId: string | null | undefined,
  filters: TimelinePinFilters,
  version = 0,
) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!coupleId) {
        setPins([]);
        setTotal(0);
        return;
      }

      const requestId = ++requestIdRef.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setPins([]);
      }
      setError(null);

      const { data, error, count } = await applyFilters(
        supabase.from("pins"),
        coupleId,
        filters,
        append ? undefined : "exact",
      ).range(offset, offset + PAGE_SIZE - 1);

      if (requestId !== requestIdRef.current) return;

      if (error) {
        setError(error.message);
        if (!append) setPins([]);
      } else {
        setPins((prev) =>
          append
            ? [...prev, ...((data as Pin[]) ?? [])]
            : ((data as Pin[]) ?? []),
        );
        if (typeof count === "number") setTotal(count);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coupleId, filters, version],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPage(0, false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || pins.length >= total) return;
    void fetchPage(pins.length, true);
  }, [fetchPage, loading, loadingMore, pins.length, total]);

  return {
    pins,
    total,
    loading,
    loadingMore,
    error,
    hasMore: pins.length < total,
    loadMore,
    refresh: () => fetchPage(0, false),
  };
}
