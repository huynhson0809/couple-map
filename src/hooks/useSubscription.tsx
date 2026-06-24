import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import type { PlanType, Subscription } from "../types";

// All style IDs in display order (matches MAP_STYLES in useMapStyle.ts)
const MAP_STYLE_IDS = [
  "bright",
  "candy",
  "midnight",
  "romantic",
  "vintage",
  "ocean",
  "forest",
  "sunset",
  "monochrome",
  "lavender",
  "sakura",
  "liberty",
  "positron",
  "dark",
  "fiord",
];

// Plan limits configuration
const PLAN_LIMITS = {
  free: {
    pins: 100,
    photosPerPin: 3,
    video: false,
    mapStyles: 3,
    customCategories: 0,
    graceperiodDays: 0,
    collections: 0,
    shareCardWatermark: true,
  },
  plus: {
    pins: 300,
    photosPerPin: 5,
    video: false,
    mapStyles: 10,
    customCategories: 5,
    graceperiodDays: 1,
    collections: 3,
    shareCardWatermark: false,
  },
  pro: {
    pins: Infinity,
    photosPerPin: 5,
    video: true,
    mapStyles: 15,
    customCategories: Infinity,
    graceperiodDays: 3,
    collections: Infinity,
    shareCardWatermark: false,
  },
} as const;

// Free map styles (indices into the styles array)
const FREE_STYLE_IDS = ["bright", "midnight", "candy"];

interface SubscriptionContextValue {
  plan: PlanType;
  subscription: Subscription | null;
  loading: boolean;
  limits: (typeof PLAN_LIMITS)[PlanType];
  isPremium: boolean;
  canUploadVideo: boolean;
  canUseMapStyle: (styleId: string) => boolean;
  canUseMap3D: boolean;
  canCreatePin: (currentCount: number) => boolean;
  canAddPhoto: (currentCount: number) => boolean;
  canCreateCategory: (currentCount: number) => boolean;
  canCreateCollection: (currentCount: number) => boolean;
  hasWatermark: boolean;
  refetch: () => Promise<void>;
  activateCode: (code: string) => Promise<{
    success: boolean;
    message: string;
    plan?: string;
    expires_at?: string;
  }>;
}

const SubscriptionCtx = createContext<SubscriptionContextValue | null>(null);

type SubscriptionContextPayload = {
  plan?: string | null;
  subscription?: Subscription | null;
  map3d?: boolean | null;
  entitlements?: {
    map3d?: boolean | null;
  } | null;
};

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizePlan(plan: string | null | undefined): PlanType {
  if (plan === "plus" || plan === "pro") return plan;
  return "free";
}

function normalizeSubscriptionContext(data: unknown): {
  plan: PlanType;
  subscription: Subscription | null;
  canUseMap3D: boolean;
} {
  const payload = (data ?? {}) as SubscriptionContextPayload;
  const plan = normalizePlan(payload.plan);
  const entitlementFromObject = readBoolean(payload.entitlements?.map3d);
  const entitlementFromTopLevel = readBoolean(payload.map3d);
  const canUseMap3D =
    entitlementFromObject ?? entitlementFromTopLevel ?? plan !== "free";

  return {
    plan,
    subscription: plan === "free" ? null : (payload.subscription ?? null),
    canUseMap3D,
  };
}

export function SubscriptionProvider({
  coupleId,
  children,
}: {
  coupleId: string | null;
  children: ReactNode;
}) {
  const [plan, setPlan] = useState<PlanType>("free");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [map3dEntitled, setMap3dEntitled] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const fetchPlan = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!coupleId) {
      setPlan("free");
      setSubscription(null);
      setMap3dEntitled(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.rpc(
      "get_subscription_context_for_couple",
      { p_couple_id: coupleId },
    );

    if (requestId !== requestIdRef.current) return;

    if (error) {
      setPlan("free");
      setSubscription(null);
      setMap3dEntitled(false);
      setLoading(false);
      return;
    }

    const context = normalizeSubscriptionContext(data);
    setPlan(context.plan);
    setSubscription(context.subscription);
    setMap3dEntitled(context.canUseMap3D);
    setLoading(false);
  }, [coupleId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPlan();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchPlan]);

  // Listen for realtime changes to couple plan
  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`couple-plan-${coupleId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "couples",
          filter: `id=eq.${coupleId}`,
        },
        (payload) => {
          const newPlan = payload.new?.plan as PlanType;
          if (newPlan) {
            setPlan(newPlan);
            void fetchPlan();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `couple_id=eq.${coupleId}`,
        },
        () => {
          void fetchPlan();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, fetchPlan]);

  const limits = PLAN_LIMITS[plan];

  const activateCode = useCallback(
    async (code: string) => {
      const { data, error } = await supabase.functions.invoke(
        "create-checkout",
        {
          body: { code },
        },
      );

      if (error) {
        return { success: false, message: error.message || "Lỗi kích hoạt" };
      }

      if (data?.error) {
        return { success: false, message: data.error };
      }

      // Refetch plan after successful activation
      await fetchPlan();
      return {
        success: true,
        message: data.message,
        plan: data.plan,
        expires_at: data.expires_at,
      };
    },
    [fetchPlan],
  );

  const canUseMapStyle = useCallback(
    (styleId: string) => {
      if (loading) return true; // Don't gate while plan is loading
      if (plan === "pro") return true;
      if (plan === "plus") {
        const idx = MAP_STYLE_IDS.indexOf(styleId);
        return idx >= 0 && idx < 10;
      }
      return FREE_STYLE_IDS.includes(styleId);
    },
    [loading, plan],
  );

  const value: SubscriptionContextValue = {
    plan,
    subscription,
    loading,
    limits,
    isPremium: plan !== "free",
    canUploadVideo: limits.video,
    canUseMapStyle,
    canUseMap3D: loading ? true : map3dEntitled,
    canCreatePin: (currentCount: number) => currentCount < limits.pins,
    canAddPhoto: (currentCount: number) => currentCount < limits.photosPerPin,
    canCreateCategory: (currentCount: number) =>
      currentCount < limits.customCategories,
    canCreateCollection: (currentCount: number) =>
      currentCount < limits.collections,
    hasWatermark: limits.shareCardWatermark,
    refetch: fetchPlan,
    activateCode,
  };

  return (
    <SubscriptionCtx.Provider value={value}>
      {children}
    </SubscriptionCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSubscription() {
  const ctx = useContext(SubscriptionCtx);
  if (!ctx)
    throw new Error("useSubscription must be inside SubscriptionProvider");
  return ctx;
}

export { FREE_STYLE_IDS, PLAN_LIMITS };
