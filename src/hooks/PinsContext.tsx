import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePins } from "./usePins";
import { useViewportPins, type Viewport } from "./useViewportPins";
import { useCoupleRealtime } from "./useCoupleRealtime";
import { supabase } from "../lib/supabase";
import { invalidateApiCacheByPrefix } from "../lib/apiCache";
import { processPendingUploads } from "../lib/pendingUploads";
import { useSubscription } from "./useSubscription";
import { useI18n } from "./I18nContext";
import type { Pin, PinImage } from "../types";

type PinsHook = ReturnType<typeof usePins>;
type CreatePinArgs = Parameters<PinsHook["createPin"]>;
type UpdatePinArgs = Parameters<PinsHook["updatePin"]>;

const PIN_SELECT_WITH_IMAGES_AND_CATEGORIES =
  "*, images:pin_images(*), categories:pin_categories(pin_id,couple_id,category_id,position,created_at)";

export type UploadingPinInfo = { progress: number };

interface Ctx extends PinsHook {
  latestPartnerPin: Pin | null;
  clearLatestPartnerPin: () => void;
  uploadingPins: Map<string, UploadingPinInfo>;
  setUploadProgress: (pinId: string, progress: number, spaceId: string) => void;
  clearUploadProgress: (pinId: string, spaceId: string) => void;
  pinsVersion: number;
  bumpPinsVersion: () => void;
  onViewportChange: (viewport: Viewport) => void;
  loadAllPins: () => Promise<void>;
  loadPinById: (id: string) => Promise<Pin | null>;
  allPinsLoaded: boolean;
}

const PinsCtx = createContext<Ctx | null>(null);

export function PinsProvider({
  spaceId,
  userId,
  children,
}: {
  spaceId: string | null | undefined;
  userId: string | undefined;
  children: ReactNode;
}) {
  const { currentSpaceWritable, loading: subscriptionLoading } =
    useSubscription();
  const { lang } = useI18n();
  const writable = !subscriptionLoading && currentSpaceWritable;
  const pinsHook = usePins(spaceId, userId, writable, lang);
  const viewport = useViewportPins(spaceId);
  const {
    fetchPinImages: fetchPinImagesBase,
    createPin: createPinBase,
    deletePin: deletePinBase,
    updatePin: updatePinBase,
  } = pinsHook;
  const {
    pins: viewportPins,
    addPin,
    removePin,
    updatePinLocal,
    onViewportChange,
    loadAll,
    loadPinById,
    allLoaded,
  } = viewport;
  const userIdRef = useRef(userId);
  const activeSpaceIdRef = useRef(spaceId);

  // Keep async guards current before passive effects and browser callbacks run.
  useLayoutEffect(() => {
    userIdRef.current = userId;
    activeSpaceIdRef.current = spaceId;
  }, [spaceId, userId]);

  // Images cache: stores fetched images keyed by pin ID
  const [imagesCache, setImagesCache] = useState<Record<string, PinImage[]>>(
    {},
  );

  // Override fetchPinImages to also update our cache
  const fetchPinImages = useCallback(
    async (pinId: string): Promise<PinImage[]> => {
      const targetSpaceId = activeSpaceIdRef.current;
      const targetUserId = userIdRef.current;
      const images = await fetchPinImagesBase(pinId);
      if (
        activeSpaceIdRef.current !== targetSpaceId ||
        userIdRef.current !== targetUserId
      ) return [];
      setImagesCache((prev) => ({ ...prev, [pinId]: images }));
      return images;
    },
    [fetchPinImagesBase],
  );

  // Merge viewport pins with images cache
  const pins = useMemo(
    () =>
      viewportPins.map((p) =>
        imagesCache[p.id] ? { ...p, images: imagesCache[p.id] } : p,
      ),
    [imagesCache, viewportPins],
  );

  const [latestPartnerPinSnapshot, setLatestPartnerPinSnapshot] = useState<{
    spaceId: string | null;
    pin: Pin | null;
  }>({ spaceId: null, pin: null });
  const latestPartnerPin =
    latestPartnerPinSnapshot.spaceId === spaceId
      ? latestPartnerPinSnapshot.pin
      : null;
  const clearLatestPartnerPin = useCallback(
    () => setLatestPartnerPinSnapshot({
      spaceId: activeSpaceIdRef.current ?? null,
      pin: null,
    }),
    [],
  );

  const [uploadSnapshot, setUploadSnapshot] = useState<{
    spaceId: string | null;
    pins: Map<string, UploadingPinInfo>;
  }>({ spaceId: null, pins: new Map() });
  const uploadingPins = useMemo(
    () => uploadSnapshot.spaceId === spaceId ? uploadSnapshot.pins : new Map(),
    [spaceId, uploadSnapshot],
  );
  const setUploadProgress = useCallback((pinId: string, progress: number, targetSpaceId: string) => {
    if (activeSpaceIdRef.current !== targetSpaceId) return;
    setUploadSnapshot((current) => {
      const next = new Map(
        current.spaceId === targetSpaceId ? current.pins : [],
      );
      next.set(pinId, { progress });
      return { spaceId: targetSpaceId, pins: next };
    });
  }, []);
  const clearUploadProgress = useCallback((pinId: string, targetSpaceId: string) => {
    if (activeSpaceIdRef.current !== targetSpaceId) return;
    setUploadSnapshot((current) => {
      const next = new Map(
        current.spaceId === targetSpaceId ? current.pins : [],
      );
      next.delete(pinId);
      return { spaceId: targetSpaceId, pins: next };
    });
  }, []);

  const [pinsVersion, setPinsVersion] = useState(0);
  const invalidateStatsCache = useCallback(() => {
    invalidateApiCacheByPrefix("couple-stats:");
  }, []);
  const bumpPinsVersion = useCallback(() => {
    invalidateStatsCache();
    setPinsVersion((v) => v + 1);
  }, [invalidateStatsCache]);

  // Resume any pending uploads from IndexedDB on app start
  useEffect(() => {
    if (!spaceId || !writable) return;
    processPendingUploads(
      spaceId,
      (pinId, pct) => {
        if (activeSpaceIdRef.current !== spaceId) return;
        setUploadSnapshot((current) => {
          const next = new Map(
            current.spaceId === spaceId ? current.pins : [],
          );
          next.set(pinId, { progress: pct });
          return { spaceId, pins: next };
        });
      },
      (pinId) => {
        if (activeSpaceIdRef.current !== spaceId) return;
        setUploadSnapshot((current) => {
          const next = new Map(
            current.spaceId === spaceId ? current.pins : [],
          );
          next.delete(pinId);
          return { spaceId, pins: next };
        });
        invalidateStatsCache();
        setPinsVersion((v) => v + 1);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, writable]);

  useCoupleRealtime({
    spaceId,
    onInsert: async (pin) => {
      invalidateStatsCache();
      let pinWithRelations = pin;
      try {
        const { data } = await supabase
          .from("pins")
          .select(PIN_SELECT_WITH_IMAGES_AND_CATEGORIES)
          .eq("id", pin.id)
          .order("position", { referencedTable: "categories", ascending: true })
          .order("sort_order", { referencedTable: "images", ascending: true })
          .maybeSingle();
        if (data) pinWithRelations = data as Pin;
      } catch {
        pinWithRelations = pin;
      }
      addPin(pinWithRelations);
      const pinSpaceId = pin.space_id ?? pin.couple_id;
      if (
        pinSpaceId === activeSpaceIdRef.current &&
        pin.created_by &&
        pin.created_by !== userIdRef.current
      ) {
        setLatestPartnerPinSnapshot({ spaceId: pinSpaceId, pin: pinWithRelations });
      }
    },
    onUpdate: async (pin) => {
      invalidateStatsCache();
      try {
        const { data } = await supabase
          .from("pins")
          .select(PIN_SELECT_WITH_IMAGES_AND_CATEGORIES)
          .eq("id", pin.id)
          .order("position", { referencedTable: "categories", ascending: true })
          .order("sort_order", { referencedTable: "images", ascending: true })
          .maybeSingle();
        if (data) updatePinLocal(pin.id, data as Pin);
      } catch (err) {
        console.warn("Failed to refresh realtime pin update:", err);
      }
    },
    onDelete: (id) => {
      invalidateStatsCache();
      removePin(id);
    },
  });

  // Wrap create/delete to also update viewport state
  const createPin = useCallback(
    async (...args: CreatePinArgs) => {
      const newPin = await createPinBase(...args);
      invalidateStatsCache();
      addPin(newPin);
      return newPin;
    },
    [createPinBase, invalidateStatsCache, addPin],
  );

  const deletePin = useCallback(
    async (id: string) => {
      await deletePinBase(id);
      invalidateStatsCache();
      removePin(id);
    },
    [deletePinBase, invalidateStatsCache, removePin],
  );

  const updatePin = useCallback(
    async (...args: UpdatePinArgs) => {
      const updated = await updatePinBase(...args);
      invalidateStatsCache();
      updatePinLocal(updated.id, updated);
      return updated;
    },
    [updatePinBase, invalidateStatsCache, updatePinLocal],
  );

  const value: Ctx = {
    ...pinsHook,
    pins,
    fetchPinImages,
    createPin,
    deletePin,
    updatePin,
    latestPartnerPin,
    clearLatestPartnerPin,
    uploadingPins,
    setUploadProgress,
    clearUploadProgress,
    pinsVersion,
    bumpPinsVersion,
    onViewportChange,
    loadAllPins: loadAll,
    loadPinById,
    allPinsLoaded: allLoaded,
  };

  return <PinsCtx.Provider value={value}>{children}</PinsCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePinsCtx() {
  const v = useContext(PinsCtx);
  if (!v) throw new Error("usePinsCtx must be used within PinsProvider");
  return v;
}
