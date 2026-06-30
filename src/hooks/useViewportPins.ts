import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Pin } from "../types";

export interface Viewport {
  north: number;
  south: number;
  east: number;
  west: number;
}

const DEBOUNCE_MS = 300;
const BUFFER = 0.3; // 30% padding beyond viewport
const PAGE_SIZE = 100; // Load pins in pages when viewport expands
const PIN_SELECT_WITH_CATEGORIES =
  "id, couple_id, created_by, title, note, lat, lng, address, city, country, category, marker_emoji, marker_image_url, is_favorite, created_at, updated_at, categories:pin_categories(pin_id,couple_id,category_id,position,created_at)";

function expandBounds(vp: Viewport): Viewport {
  const latSpan = vp.north - vp.south;
  const lngSpan = vp.east - vp.west;
  return {
    north: vp.north + latSpan * BUFFER,
    south: vp.south - latSpan * BUFFER,
    east: vp.east + lngSpan * BUFFER,
    west: vp.west - lngSpan * BUFFER,
  };
}

export function useViewportPins(spaceId: string | null | undefined) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const loadedBoundsRef = useRef<Viewport | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  // Cache of all pin IDs already loaded to avoid duplicates
  const loadedIdsRef = useRef<Set<string>>(new Set());

  const fetchForViewport = useCallback(
    async (viewport: Viewport) => {
      if (!spaceId) return;

      // If we already loaded all pins, skip
      if (allLoaded) return;

      // If new viewport is within previously loaded bounds, skip
      const prev = loadedBoundsRef.current;
      if (
        prev &&
        viewport.north <= prev.north &&
        viewport.south >= prev.south &&
        viewport.east <= prev.east &&
        viewport.west >= prev.west
      ) {
        return;
      }

      const expanded = expandBounds(viewport);
      const reqId = ++requestIdRef.current;
      setLoading(true);

      // Paginated fetch - load PAGE_SIZE at a time
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("pins")
          .select(PIN_SELECT_WITH_CATEGORIES)
          .eq("couple_id", spaceId)
          .gte("lat", expanded.south)
          .lte("lat", expanded.north)
          .gte("lng", expanded.west)
          .lte("lng", expanded.east)
          .order("position", { referencedTable: "categories", ascending: true })
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (reqId !== requestIdRef.current) return;

        if (error || !data) {
          break;
        }

        const newPins = (data as Pin[]).filter(
          (p) => !loadedIdsRef.current.has(p.id),
        );
        if (newPins.length > 0) {
          newPins.forEach((p) => loadedIdsRef.current.add(p.id));
          setPins((prev) => [...prev, ...newPins]);
        }

        hasMore = data.length === PAGE_SIZE;
        offset += PAGE_SIZE;
      }

      // Expand loaded bounds
      if (prev) {
        loadedBoundsRef.current = {
          north: Math.max(prev.north, expanded.north),
          south: Math.min(prev.south, expanded.south),
          east: Math.max(prev.east, expanded.east),
          west: Math.min(prev.west, expanded.west),
        };
      } else {
        loadedBoundsRef.current = expanded;
      }
      setLoading(false);
    },
    [spaceId, allLoaded],
  );

  /** Call this when map viewport changes (debounced) */
  const onViewportChange = useCallback(
    (viewport: Viewport) => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void fetchForViewport(viewport);
      }, DEBOUNCE_MS);
    },
    [fetchForViewport],
  );

  /** Load ALL pins (for stats/search that need full dataset) */
  const loadAll = useCallback(async () => {
    if (!spaceId || allLoaded) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pins")
      .select(PIN_SELECT_WITH_CATEGORIES)
      .eq("couple_id", spaceId)
      .order("position", { referencedTable: "categories", ascending: true })
      .order("created_at", { ascending: false });
    if (!error && data) {
      const allPins = data as Pin[];
      loadedIdsRef.current = new Set(allPins.map((p) => p.id));
      setPins(allPins);
      setAllLoaded(true);
    }
    setLoading(false);
  }, [spaceId, allLoaded]);

  const loadPinById = useCallback(
    async (id: string): Promise<Pin | null> => {
      if (!spaceId) return null;
      const { data, error } = await supabase
        .from("pins")
        .select(PIN_SELECT_WITH_CATEGORIES)
        .eq("couple_id", spaceId)
        .eq("id", id)
        .order("position", { referencedTable: "categories", ascending: true })
        .maybeSingle();

      if (error || !data) return null;
      const pin = data as Pin;
      loadedIdsRef.current.add(pin.id);
      setPins((prev) => {
        const exists = prev.some((p) => p.id === pin.id);
        if (exists) return prev.map((p) => (p.id === pin.id ? pin : p));
        return [pin, ...prev];
      });
      return pin;
    },
    [spaceId],
  );

  /** Add a newly created pin to local state */
  const addPin = useCallback((pin: Pin) => {
    loadedIdsRef.current.add(pin.id);
    setPins((prev) => [pin, ...prev.filter((p) => p.id !== pin.id)]);
  }, []);

  /** Remove pin from local state */
  const removePin = useCallback((id: string) => {
    loadedIdsRef.current.delete(id);
    setPins((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /** Update pin in local state */
  const updatePinLocal = useCallback((id: string, patch: Partial<Pin>) => {
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  // Reset when spaceId changes
  useEffect(() => {
    requestIdRef.current += 1;
    loadedBoundsRef.current = null;
    loadedIdsRef.current = new Set();

    const timer = window.setTimeout(() => {
      setPins([]);
      setAllLoaded(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [spaceId]);

  return {
    pins,
    loading,
    allLoaded,
    onViewportChange,
    loadAll,
    loadPinById,
    addPin,
    removePin,
    updatePinLocal,
    setPins,
  };
}
