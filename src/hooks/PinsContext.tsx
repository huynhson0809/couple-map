import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import type { Pin, PinImage } from "../types";

type PinsHook = ReturnType<typeof usePins>;
type CreatePinArgs = Parameters<PinsHook["createPin"]>;
type UpdatePinArgs = Parameters<PinsHook["updatePin"]>;

export type UploadingPinInfo = { progress: number };

interface Ctx extends PinsHook {
  latestPartnerPin: Pin | null;
  clearLatestPartnerPin: () => void;
  uploadingPins: Map<string, UploadingPinInfo>;
  setUploadProgress: (pinId: string, progress: number) => void;
  clearUploadProgress: (pinId: string) => void;
  pinsVersion: number;
  bumpPinsVersion: () => void;
  onViewportChange: (viewport: Viewport) => void;
  loadAllPins: () => Promise<void>;
  loadPinById: (id: string) => Promise<Pin | null>;
  allPinsLoaded: boolean;
}

const PinsCtx = createContext<Ctx | null>(null);

export function PinsProvider({
  coupleId,
  userId,
  children,
}: {
  coupleId: string | null | undefined;
  userId: string | undefined;
  children: ReactNode;
}) {
  const pinsHook = usePins(coupleId, userId);
  const viewport = useViewportPins(coupleId);
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

  // Images cache: stores fetched images keyed by pin ID
  const [imagesCache, setImagesCache] = useState<Record<string, PinImage[]>>(
    {},
  );

  // Override fetchPinImages to also update our cache
  const fetchPinImages = useCallback(
    async (pinId: string): Promise<PinImage[]> => {
      const images = await fetchPinImagesBase(pinId);
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

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const [latestPartnerPin, setLatestPartnerPin] = useState<Pin | null>(null);
  const clearLatestPartnerPin = useCallback(
    () => setLatestPartnerPin(null),
    [],
  );

  const [uploadingPins, setUploadingPins] = useState<
    Map<string, UploadingPinInfo>
  >(() => new Map());
  const setUploadProgress = useCallback((pinId: string, progress: number) => {
    setUploadingPins((prev) => {
      const next = new Map(prev);
      next.set(pinId, { progress });
      return next;
    });
  }, []);
  const clearUploadProgress = useCallback((pinId: string) => {
    setUploadingPins((prev) => {
      const next = new Map(prev);
      next.delete(pinId);
      return next;
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

  useCoupleRealtime({
    coupleId,
    onInsert: async (pin) => {
      invalidateStatsCache();
      addPin(pin);
      if (pin.created_by && pin.created_by !== userIdRef.current) {
        try {
          const { data } = await supabase
            .from("pins")
            .select("*, images:pin_images(*)")
            .eq("id", pin.id)
            .maybeSingle();
          if (data) setLatestPartnerPin(data as Pin);
          else setLatestPartnerPin(pin);
        } catch {
          setLatestPartnerPin(pin);
        }
      }
    },
    onUpdate: async (pin) => {
      invalidateStatsCache();
      updatePinLocal(pin.id, pin);
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
