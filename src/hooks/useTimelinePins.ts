import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const { data, error } = await supabase.rpc("get_timeline_pin_page_ids", {
    in_couple_id: spaceId,
    in_category_ids: filters.categoryIds,
    in_include_favorites: filters.includeFavorites,
    in_date_from: filters.dateFrom
      ? localDateBoundaryIso(filters.dateFrom, "start")
      : null,
    in_date_to: filters.dateTo
      ? localDateBoundaryIso(filters.dateTo, "end")
      : null,
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

async function fetchTimelineWindow(
  spaceId: string,
  filters: TimelinePinFilters,
  offset: number,
  count: number,
  isCurrent: () => boolean,
) {
  const rows: TimelinePinPageId[] = [];
  while (rows.length < count && isCurrent()) {
    const page = await fetchTimelinePinPageIds(
      spaceId,
      filters,
      offset + rows.length,
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export function useTimelinePins(
  spaceId: string | null | undefined,
  filters: TimelinePinFilters,
  version = 0,
) {
  const queryKey = useMemo(
    () => JSON.stringify({ spaceId: spaceId ?? null, filters }),
    [filters, spaceId],
  );
  const queryFilters = useMemo<TimelinePinFilters>(
    () => JSON.parse(queryKey).filters,
    [queryKey],
  );
  const [pins, setPins] = useState<Pin[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataQueryKey, setDataQueryKey] = useState(queryKey);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const loadedCountRef = useRef(0);
  const appliedVersionRef = useRef(version);
  const visiblePins = dataQueryKey === queryKey ? pins : [];
  const visibleTotal = dataQueryKey === queryKey ? total : 0;
  const visibleLoading = dataQueryKey === queryKey ? loading : Boolean(spaceId);
  const visibleLoadingMore = dataQueryKey === queryKey ? loadingMore : false;
  const visibleError = dataQueryKey === queryKey ? error : null;

  const fetchPage = useCallback(
    async (offset: number, append: boolean, preserve = false) => {
      if (append && inFlightRef.current) return;
      const targetQueryKey = queryKey;
      if (!spaceId) {
        requestIdRef.current += 1;
        inFlightRef.current = false;
        loadedCountRef.current = 0;
        setDataQueryKey(targetQueryKey);
        setPins([]);
        setTotal(0);
        setNextOffset(0);
        setLoading(false);
        setLoadingMore(false);
        setError(null);
        return;
      }

      const requestId = ++requestIdRef.current;
      inFlightRef.current = true;
      const targetCount = preserve
        ? Math.max(PAGE_SIZE, loadedCountRef.current)
        : PAGE_SIZE;
      if (append || preserve) setLoadingMore(true);
      else {
        setDataQueryKey(targetQueryKey);
        setLoading(true);
        setLoadingMore(false);
        setPins([]);
        setTotal(0);
        setNextOffset(0);
        loadedCountRef.current = 0;
      }
      setError(null);

      try {
        const pageIds = await fetchTimelineWindow(
          spaceId,
          queryFilters,
          offset,
          targetCount,
          () => requestId === requestIdRef.current,
        );
        if (requestId !== requestIdRef.current) return;

        const ids = pageIds.map((row) => row.pin_id);
        const pagePins = await fetchTimelinePinsByIds(ids);
        if (requestId !== requestIdRef.current) return;

        setPins((prev) =>
          append
            ? [
                ...new Map(
                  [...prev, ...pagePins].map((pin) => [pin.id, pin]),
                ).values(),
              ]
            : pagePins,
        );
        loadedCountRef.current = offset + pageIds.length;
        setNextOffset(loadedCountRef.current);
        if (!append) setTotal(Number(pageIds[0]?.total_count ?? 0));
      } catch (fetchError) {
        if (requestId !== requestIdRef.current) return;
        console.error("Failed to load timeline memories:", fetchError);
        setError("timeline_load_failed");
        if (!append && !preserve) {
          setPins([]);
          setTotal(0);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          inFlightRef.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [spaceId, queryFilters, queryKey],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPage(0, false);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
      inFlightRef.current = false;
    };
  }, [fetchPage]);

  useEffect(() => {
    if (
      appliedVersionRef.current === version ||
      dataQueryKey !== queryKey ||
      loading ||
      loadingMore ||
      inFlightRef.current
    )
      return;
    appliedVersionRef.current = version;
    void fetchPage(0, false, true);
  }, [dataQueryKey, fetchPage, loading, loadingMore, queryKey, version]);

  const loadMore = useCallback(() => {
    if (visibleLoading || visibleLoadingMore || nextOffset >= visibleTotal)
      return;
    void fetchPage(nextOffset, true);
  }, [fetchPage, visibleLoading, visibleLoadingMore, nextOffset, visibleTotal]);

  return {
    pins: visiblePins,
    total: visibleTotal,
    loading: visibleLoading,
    loadingMore: visibleLoadingMore,
    error: visibleError,
    hasMore: nextOffset < visibleTotal,
    loadMore,
    refresh: () => fetchPage(0, false),
  };
}
