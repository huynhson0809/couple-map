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
import type {
  AccountSubscription,
  BillingCycle,
  PlanType,
  Subscription,
} from "../types";

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
    ownedSpaces: 1,
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
    ownedSpaces: 2,
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
    ownedSpaces: 3,
  },
} as const;

// Free map styles (indices into the styles array)
const FREE_STYLE_IDS = ["bright", "midnight", "candy"];
const BILLING_RETURN_POLL_DELAYS_MS = [
  0, 1000, 2000, 3000, 5000, 8000, 13000,
];

type ActiveSubscription =
  | Subscription
  | (AccountSubscription & { current_period_end: string });

interface SubscriptionContextValue {
  plan: PlanType;
  accountPlan: PlanType;
  spacePlan: PlanType;
  spaceOwnerId: string | null;
  ownedSpaceCount: number;
  ownedSpaceLimit: number;
  canCreateSpace: boolean;
  subscription: ActiveSubscription | null;
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
  checkout: (
    plan: Exclude<PlanType, "free">,
    cycle: BillingCycle,
  ) => Promise<void>;
  openCustomerPortal: () => Promise<void>;
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
  account_plan?: string | null;
  space_plan?: string | null;
  space_owner_id?: string | null;
  owned_space_count?: number | null;
  owned_space_limit?: number | null;
  can_create_space?: boolean | null;
  subscription?: AccountSubscription | Subscription | null;
  limits?: {
    ownedSpaces?: number | null;
  } | null;
  map3d?: boolean | null;
  entitlements?: {
    map3d?: boolean | null;
  } | null;
};

const DEFAULT_SUBSCRIPTION_CONTEXT = {
  plan: "free" as PlanType,
  accountPlan: "free" as PlanType,
  spacePlan: "free" as PlanType,
  spaceOwnerId: null as string | null,
  ownedSpaceCount: 0,
  ownedSpaceLimit: PLAN_LIMITS.free.ownedSpaces,
  canCreateSpace: true,
  subscription: null as ActiveSubscription | null,
  canUseMap3D: false,
};

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePlan(plan: string | null | undefined): PlanType {
  if (plan === "plus" || plan === "pro") return plan;
  return "free";
}

function normalizeActiveSubscription(
  subscription: AccountSubscription | Subscription | null | undefined,
  accountPlan: PlanType,
): ActiveSubscription | null {
  if (accountPlan === "free" || !subscription) return null;
  if (typeof subscription.current_period_end !== "string") return null;
  return subscription as ActiveSubscription;
}

function normalizeSubscriptionContext(data: unknown): {
  plan: PlanType;
  accountPlan: PlanType;
  spacePlan: PlanType;
  spaceOwnerId: string | null;
  ownedSpaceCount: number;
  ownedSpaceLimit: number;
  canCreateSpace: boolean;
  subscription: ActiveSubscription | null;
  canUseMap3D: boolean;
} {
  const payload = (data ?? {}) as SubscriptionContextPayload;
  const accountPlan = normalizePlan(payload.account_plan ?? payload.plan);
  const spacePlan = normalizePlan(payload.space_plan ?? payload.plan);
  const plan = spacePlan;
  const ownedSpaceCount = readNumber(payload.owned_space_count) ?? 0;
  const ownedSpaceLimit =
    readNumber(payload.owned_space_limit) ??
    readNumber(payload.limits?.ownedSpaces) ??
    PLAN_LIMITS[accountPlan].ownedSpaces;
  const entitlementFromObject = readBoolean(payload.entitlements?.map3d);
  const entitlementFromTopLevel = readBoolean(payload.map3d);
  const canUseMap3D =
    entitlementFromObject ?? entitlementFromTopLevel ?? plan !== "free";

  return {
    plan,
    accountPlan,
    spacePlan,
    spaceOwnerId:
      typeof payload.space_owner_id === "string" ? payload.space_owner_id : null,
    ownedSpaceCount,
    ownedSpaceLimit,
    canCreateSpace:
      readBoolean(payload.can_create_space) ??
      ownedSpaceCount < ownedSpaceLimit,
    subscription: normalizeActiveSubscription(payload.subscription, accountPlan),
    canUseMap3D,
  };
}

function messageFromError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function returnedUrl(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const url = (data as { url?: unknown }).url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function configuredBillingAppUrl(): string | null {
  const value = import.meta.env.VITE_APP_URL;
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function billingReturnAppUrl() {
  return configuredBillingAppUrl() ?? window.location.origin;
}

export function SubscriptionProvider({
  spaceId,
  children,
}: {
  spaceId: string | null;
  children: ReactNode;
}) {
  const [plan, setPlan] = useState<PlanType>("free");
  const [accountPlan, setAccountPlan] = useState<PlanType>("free");
  const [spacePlan, setSpacePlan] = useState<PlanType>("free");
  const [spaceOwnerId, setSpaceOwnerId] = useState<string | null>(null);
  const [ownedSpaceCount, setOwnedSpaceCount] = useState(0);
  const [ownedSpaceLimit, setOwnedSpaceLimit] = useState<number>(
    PLAN_LIMITS.free.ownedSpaces,
  );
  const [canCreateSpace, setCanCreateSpace] = useState(true);
  const [subscription, setSubscription] = useState<ActiveSubscription | null>(
    null,
  );
  const [map3dEntitled, setMap3dEntitled] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const resetSubscriptionContext = useCallback(() => {
    setPlan(DEFAULT_SUBSCRIPTION_CONTEXT.plan);
    setAccountPlan(DEFAULT_SUBSCRIPTION_CONTEXT.accountPlan);
    setSpacePlan(DEFAULT_SUBSCRIPTION_CONTEXT.spacePlan);
    setSpaceOwnerId(DEFAULT_SUBSCRIPTION_CONTEXT.spaceOwnerId);
    setOwnedSpaceCount(DEFAULT_SUBSCRIPTION_CONTEXT.ownedSpaceCount);
    setOwnedSpaceLimit(DEFAULT_SUBSCRIPTION_CONTEXT.ownedSpaceLimit);
    setCanCreateSpace(DEFAULT_SUBSCRIPTION_CONTEXT.canCreateSpace);
    setSubscription(DEFAULT_SUBSCRIPTION_CONTEXT.subscription);
    setMap3dEntitled(DEFAULT_SUBSCRIPTION_CONTEXT.canUseMap3D);
  }, []);

  const fetchPlan = useCallback(async (scheduledRequestId?: number) => {
    const requestId = scheduledRequestId ?? ++requestIdRef.current;

    if (requestId !== requestIdRef.current) return;

    if (!spaceId) {
      resetSubscriptionContext();
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.rpc(
      "get_subscription_context_for_space",
      { p_space_id: spaceId },
    );

    if (requestId !== requestIdRef.current) return;

    if (error) {
      resetSubscriptionContext();
      setLoading(false);
      return;
    }

    const context = normalizeSubscriptionContext(data);
    setPlan(context.plan);
    setAccountPlan(context.accountPlan);
    setSpacePlan(context.spacePlan);
    setSpaceOwnerId(context.spaceOwnerId);
    setOwnedSpaceCount(context.ownedSpaceCount);
    setOwnedSpaceLimit(context.ownedSpaceLimit);
    setCanCreateSpace(context.canCreateSpace);
    setSubscription(context.subscription);
    setMap3dEntitled(context.canUseMap3D);
    setLoading(false);
  }, [resetSubscriptionContext, spaceId]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      void fetchPlan(requestId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchPlan]);

  useEffect(() => {
    if (!spaceId) return;

    const params = new URLSearchParams(window.location.search);
    const billingReturn = params.get("billing");
    if (billingReturn !== "success") return;

    let cancelled = false;
    const timers: number[] = [];

    BILLING_RETURN_POLL_DELAYS_MS.forEach((delay) => {
      const timer = window.setTimeout(() => {
        if (!cancelled) void fetchPlan();
      }, delay);
      timers.push(timer);
    });

    params.delete("billing");
    params.delete("plan");
    const nextSearch = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`,
    );

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [fetchPlan, spaceId]);

  // Keep legacy couple/subscription invalidation while billing moves to spaces.
  useEffect(() => {
    if (!spaceId) return;
    const channel = supabase
      .channel(`couple-plan-${spaceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "couples",
          filter: `id=eq.${spaceId}`,
        },
        (payload) => {
          const newPlan = normalizePlan(payload.new?.plan as string | null);
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
          filter: `couple_id=eq.${spaceId}`,
        },
        () => {
          void fetchPlan();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [spaceId, fetchPlan]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user?.id) return;

      const targetUserIds = Array.from(
        new Set([data.user.id, spaceOwnerId].filter(Boolean)),
      ) as string[];

      channel = supabase.channel(
        `account-subscription-${targetUserIds.join("-")}`,
      );

      targetUserIds.forEach((userId) => {
        if (!channel) return;
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "account_subscriptions",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            void fetchPlan();
          },
        );
      });

      channel?.subscribe();
    });

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchPlan, spaceOwnerId]);

  const limits = PLAN_LIMITS[plan];

  const checkout = useCallback(
    async (checkoutPlan: Exclude<PlanType, "free">, cycle: BillingCycle) => {
      const { data, error } = await supabase.functions.invoke(
        "create-polar-checkout",
        {
          body: {
            plan: checkoutPlan,
            cycle,
            app_url: billingReturnAppUrl(),
          },
        },
      );

      if (error) {
        throw new Error(
          messageFromError(error, "Unable to create checkout session"),
        );
      }

      const url = returnedUrl(data);
      if (!url) throw new Error("Checkout URL missing");

      window.location.assign(url);
    },
    [],
  );

  const openCustomerPortal = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke(
      "create-customer-portal",
      {
        body: { app_url: billingReturnAppUrl() },
      },
    );

    if (error) {
      throw new Error(
        messageFromError(error, "Unable to open customer portal"),
      );
    }

    const url = returnedUrl(data);
    if (!url) throw new Error("Customer portal URL missing");

    window.location.assign(url);
  }, []);

  const activateCode = useCallback(
    async (code: string) => {
      const { data, error } = await supabase.functions.invoke(
        "activate-code",
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
    accountPlan,
    spacePlan,
    spaceOwnerId,
    ownedSpaceCount,
    ownedSpaceLimit,
    canCreateSpace,
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
    checkout,
    openCustomerPortal,
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
