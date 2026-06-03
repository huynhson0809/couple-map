import {
  createContext,
  useContext,
  useCallback,
  useEffect,
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
    pins: 500,
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
  canCreatePin: (currentCount: number) => boolean;
  canAddPhoto: (currentCount: number) => boolean;
  canCreateCategory: (currentCount: number) => boolean;
  canCreateCollection: (currentCount: number) => boolean;
  hasWatermark: boolean;
  refetch: () => Promise<void>;
  activateCode: (
    code: string,
  ) => Promise<{
    success: boolean;
    message: string;
    plan?: string;
    expires_at?: string;
  }>;
}

const SubscriptionCtx = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({
  coupleId,
  children,
}: {
  coupleId: string | null;
  children: ReactNode;
}) {
  const [plan, setPlan] = useState<PlanType>("free");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPlan = useCallback(async () => {
    if (!coupleId) {
      setPlan("free");
      setSubscription(null);
      setLoading(false);
      return;
    }

    const { data: couple } = await supabase
      .from("couples")
      .select("plan")
      .eq("id", coupleId)
      .single();

    const currentPlan = (couple?.plan as PlanType) || "free";
    setPlan(currentPlan);

    if (currentPlan !== "free") {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("couple_id", coupleId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      setSubscription(sub as Subscription | null);
    } else {
      setSubscription(null);
    }

    setLoading(false);
  }, [coupleId]);

  useEffect(() => {
    fetchPlan();
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
          if (newPlan && newPlan !== plan) {
            setPlan(newPlan);
            fetchPlan(); // Refetch full subscription details
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, plan, fetchPlan]);

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

  const value: SubscriptionContextValue = {
    plan,
    subscription,
    loading,
    limits,
    isPremium: plan !== "free",
    canUploadVideo: limits.video,
    canUseMapStyle: (styleId: string) => {
      if (plan === "pro") return true;
      if (plan === "plus") {
        const idx = MAP_STYLE_IDS.indexOf(styleId);
        return idx >= 0 && idx < 10;
      }
      return FREE_STYLE_IDS.includes(styleId);
    },
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

export function useSubscription() {
  const ctx = useContext(SubscriptionCtx);
  if (!ctx)
    throw new Error("useSubscription must be inside SubscriptionProvider");
  return ctx;
}

export { FREE_STYLE_IDS, PLAN_LIMITS };
