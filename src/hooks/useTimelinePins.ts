import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Pin } from "../types";

const PAGE_SIZE = 24;
const PIN_SELECT_WITH_IMAGES_AND_CATEGORIES =
  "*, images:pin_images(*), categories:pin_categories(pin_id,couple_id,category_id,position,created_at)";

export interface TimelinePinFilters {
  categoryIds: string[];
  includeFavorites: boolean;
  dateFrom: string;
  dateTo: string;
  creatorId: string;
  address: string;
}

function cleanSearch(value: string) {
  return value.trim().replace(/[,%]/g, " ").replace(/\s+/g, " ");
}

function localDateBoundaryIso(value: string, boundary: "start" | "end") {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date =
    boundary === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  return date.toISOString();
}

interface TimelinePinPageId {
  pin_id: string;
  total_count: number;
}

async function fetchTimelinePinPageIds(
  spaceId: string,
  filters: TimelinePinFilters,
  offset: number,
): Promise<TimelinePinPageId[]> {
  const { data, error } = await supabase
    .rpc("get_timeline_pin_page_ids", {
      in_couple_id: spaceId,
      in_category_ids: filters.categoryIds,
      in_include_favorites: filters.includeFavorites,
      in_date_from: filters.dateFrom ? localDateBoundaryIso(filters.dateFrom, "start") : null,
      in_date_to: filters.dateTo ? localDateBoundaryIso(filters.dateTo, "end") : null,
      in_creator_id: filters.creatorId !== "all" ? filters.creatorId : null,
      in_address: cleanSearch(filters.address) || null,
      in_limit: PAGE_SIZE,
      in_offset: offset,
    });
  if (error) throw error;
  return (data as TimelinePinPageId[]) ?? [];
}

async function fetchTimelinePinsByIds(ids: string[]): Promise<Pin[]> {
  if (ids.length === 0) return [];
  const order = new Map(ids.map((id, index) => [id, index]));
  const { data, error } = await supabase
    .from("pins")
    .select(PIN_SELECT_WITH_IMAGES_AND_CATEGORIES)
    .in("id", ids)
    .order("position", { referencedTable: "categories", ascending: true })
    .order("sort_order", { referencedTable: "images", ascending: true });
  if (error) throw error;
  return ((data as Pin[]) ?? []).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
}

export function useTimelinePins(
  spaceId: string | null | undefined,
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
      if (!spaceId) {
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

      try {
        const pageIds = await fetchTimelinePinPageIds(spaceId, filters, offset);
        if (requestId !== requestIdRef.current) return;

        const ids = pageIds.map((row) => row.pin_id);
        const pagePins = await fetchTimelinePinsByIds(ids);
        if (requestId !== requestIdRef.current) return;

        setPins((prev) => (append ? [...prev, ...pagePins] : pagePins));
        if (!append) setTotal(Number(pageIds[0]?.total_count ?? 0));
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load pins");
        if (!append) {
          setPins([]);
          setTotal(0);
        }
      }

      setLoading(false);
      setLoadingMore(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spaceId, filters, version],
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
