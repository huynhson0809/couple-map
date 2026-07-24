import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import type { ReplayTemplateId } from "../features/yearReplay/types";
import { translate, type I18nKey, type Lang } from "./I18nContext";
import { formatLocalizedDate } from "../lib/localeFormat";

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
    pins: 50,
    photosPerPin: 3,
    video: false,
    mapStyles: 3,
    customCategories: 0,
    graceperiodDays: 0,
    collections: 0,
    shareCardWatermark: true,
    ownedSpaces: 1,
    replayTemplates: ["journey"] as readonly ReplayTemplateId[],
    replayCustomization: false,
    replayAdvancedStyling: false,
    replayWatermark: true,
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
    replayTemplates: ["journey", "scrapbook"] as readonly ReplayTemplateId[],
    replayCustomization: true,
    replayAdvancedStyling: false,
    replayWatermark: false,
  },
  pro: {
    pins: 500,
    photosPerPin: 5,
    video: true,
    mapStyles: 15,
    customCategories: Infinity,
    graceperiodDays: 3,
    collections: Infinity,
    shareCardWatermark: false,
    ownedSpaces: 3,
    replayTemplates: [
      "journey",
      "scrapbook",
      "film",
    ] as readonly ReplayTemplateId[],
    replayCustomization: true,
    replayAdvancedStyling: true,
    replayWatermark: false,
  },
} as const;

// Free map styles (indices into the styles array)
const FREE_STYLE_IDS = ["bright", "midnight", "candy"];
const BILLING_RETURN_POLL_DELAYS_MS = [
  0, 1000, 2000, 3000, 5000, 8000, 13000,
];
const ACCOUNT_SUBSCRIPTION_TIMEOUT_MS = 12_000;
const ACCOUNT_SUBSCRIPTION_SELECT = [
  "id",
  "user_id",
  "plan",
  "source",
  "status",
  "billing_cycle",
  "current_period_start",
  "current_period_end",
  "cancel_at_period_end",
  "created_at",
  "updated_at",
].join(",");

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
  spaceQuotaOverLimit: boolean;
  spaceQuotaGraceActive: boolean;
  spaceQuotaGraceEndsAt: string | null;
  spaceQuotaSelectedIds: string[];
  spaceQuotaRestrictedIds: string[];
  spaceQuotaResolved: boolean;
  currentSpaceWritable: boolean;
  subscription: ActiveSubscription | null;
  loading: boolean;
  accountLoading: boolean;
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
  canUseReplayTemplate: (templateId: ReplayTemplateId) => boolean;
  canCustomizeReplay: boolean;
  canUseAdvancedReplayStyling: boolean;
  replayHasWatermark: boolean;
  refetch: () => Promise<void>;
  saveSpaceQuotaSelection: (spaceIds: string[]) => Promise<void>;
  checkout: (
    plan: Exclude<PlanType, "free">,
    cycle: BillingCycle,
    locale: "en" | "vi",
  ) => Promise<void>;
  openCustomerPortal: () => Promise<void>;
  activateCode: (code: string, locale: Lang) => Promise<{
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
  space_plan_period_end?: string | null;
  space_owner_id?: string | null;
  owned_space_count?: number | null;
  owned_space_limit?: number | null;
  can_create_space?: boolean | null;
  current_space_writable?: boolean | null;
  space_quota?: {
    over_limit?: boolean | null;
    grace_active?: boolean | null;
    grace_ends_at?: string | null;
    selected_space_ids?: unknown;
    restricted_space_ids?: unknown;
    resolved?: boolean | null;
  } | null;
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
  spaceQuotaOverLimit: false,
  spaceQuotaGraceActive: false,
  spaceQuotaGraceEndsAt: null as string | null,
  spaceQuotaSelectedIds: [] as string[],
  spaceQuotaRestrictedIds: [] as string[],
  spaceQuotaResolved: false,
  currentSpaceWritable: true,
  spacePlanPeriodEnd: null as string | null,
  subscription: null as ActiveSubscription | null,
  canUseMap3D: false,
};

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
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

function isCurrentAccountSubscription(subscription: AccountSubscription) {
  if (
    subscription.status !== "active" &&
    subscription.status !== "trialing"
  ) {
    return false;
  }
  if (!subscription.current_period_end) return true;
  const periodEnd = new Date(subscription.current_period_end).getTime();
  return Number.isFinite(periodEnd) && periodEnd > Date.now();
}

function selectBestAccountSubscription(
  subscriptions: AccountSubscription[],
): AccountSubscription | null {
  return (
    subscriptions
      .filter(isCurrentAccountSubscription)
      .sort((a, b) => {
        const planDifference =
          (b.plan === "pro" ? 2 : 1) - (a.plan === "pro" ? 2 : 1);
        if (planDifference !== 0) return planDifference;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      })[0] ?? null
  );
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

async function loadOwnAccountSubscription(userId: string) {
  const result = await withTimeout(
    supabase
      .from("account_subscriptions")
      .select(ACCOUNT_SUBSCRIPTION_SELECT)
      .eq("user_id", userId)
      .in("status", ["active", "trialing"]),
    ACCOUNT_SUBSCRIPTION_TIMEOUT_MS,
    "Account subscription request timed out",
  );

  if (result.error) throw result.error;
  const activeSubscription = selectBestAccountSubscription(
    (result.data ?? []) as unknown as AccountSubscription[],
  );
  const accountPlan = normalizePlan(activeSubscription?.plan);

  return {
    accountPlan,
    subscription: normalizeActiveSubscription(
      activeSubscription,
      accountPlan,
    ),
  };
}

function normalizeSubscriptionContext(data: unknown): {
  plan: PlanType;
  accountPlan: PlanType;
  spacePlan: PlanType;
  spaceOwnerId: string | null;
  ownedSpaceCount: number;
  ownedSpaceLimit: number;
  canCreateSpace: boolean;
  spaceQuotaOverLimit: boolean;
  spaceQuotaGraceActive: boolean;
  spaceQuotaGraceEndsAt: string | null;
  spaceQuotaSelectedIds: string[];
  spaceQuotaRestrictedIds: string[];
  spaceQuotaResolved: boolean;
  currentSpaceWritable: boolean;
  spacePlanPeriodEnd: string | null;
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
  const quota = payload.space_quota;

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
    spaceQuotaOverLimit: readBoolean(quota?.over_limit) ?? false,
    spaceQuotaGraceActive: readBoolean(quota?.grace_active) ?? false,
    spaceQuotaGraceEndsAt:
      typeof quota?.grace_ends_at === "string" ? quota.grace_ends_at : null,
    spaceQuotaSelectedIds: readStringArray(quota?.selected_space_ids),
    spaceQuotaRestrictedIds: readStringArray(quota?.restricted_space_ids),
    spaceQuotaResolved: readBoolean(quota?.resolved) ?? false,
    currentSpaceWritable:
      readBoolean(payload.current_space_writable) ?? true,
    spacePlanPeriodEnd:
      typeof payload.space_plan_period_end === "string"
        ? payload.space_plan_period_end
        : null,
    subscription: normalizeActiveSubscription(payload.subscription, accountPlan),
    canUseMap3D,
  };
}

function messageFromError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function edgeResponseError(error: unknown): Promise<string | null> {
  if (!error || typeof error !== "object" || !("context" in error)) return null;
  const response = (error as { context?: unknown }).context;
  if (!(response instanceof Response)) return null;
  try {
    const payload = (await response.clone().json()) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : null;
  } catch {
    return null;
  }
}

function activationErrorKey(value: unknown): I18nKey {
  const message = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (message.includes("required")) return "activation.codeRequired";
  if (message.includes("too long")) return "activation.codeTooLong";
  if (message.includes("đã được sử dụng") || message.includes("already been used")) {
    return "activation.used";
  }
  if (message.includes("hết hạn") || message.includes("expired")) {
    return "activation.expired";
  }
  if (
    message.includes("không hợp lệ") ||
    message.includes("not valid") ||
    message.includes("not found")
  ) {
    return "activation.invalid";
  }
  if (message.includes("too many") || message.includes("rate limit")) {
    return "activation.rateLimited";
  }
  return "activation.failed";
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
  userId,
  children,
}: {
  spaceId: string | null;
  userId: string | undefined;
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
  const [spaceQuotaOverLimit, setSpaceQuotaOverLimit] = useState(false);
  const [spaceQuotaGraceActive, setSpaceQuotaGraceActive] = useState(false);
  const [spaceQuotaGraceEndsAt, setSpaceQuotaGraceEndsAt] = useState<
    string | null
  >(null);
  const [spaceQuotaSelectedIds, setSpaceQuotaSelectedIds] = useState<string[]>(
    [],
  );
  const [spaceQuotaRestrictedIds, setSpaceQuotaRestrictedIds] = useState<
    string[]
  >([]);
  const [spaceQuotaResolved, setSpaceQuotaResolved] = useState(false);
  const [currentSpaceWritable, setCurrentSpaceWritable] = useState(true);
  const [spacePlanPeriodEnd, setSpacePlanPeriodEnd] = useState<string | null>(
    null,
  );
  const [subscription, setSubscription] = useState<ActiveSubscription | null>(
    null,
  );
  const [map3dEntitled, setMap3dEntitled] = useState(false);
  const [resolvedSpaceId, setResolvedSpaceId] = useState<string | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [resolvedAccountUserId, setResolvedAccountUserId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [accountLoading, setAccountLoading] = useState(true);
  const requestIdRef = useRef(0);
  const accountRequestIdRef = useRef(0);
  const activeUserIdRef = useRef(userId);
  const hasLoadedPlanOnceRef = useRef(false);
  const activeSpaceContextResolved = Boolean(
    userId &&
      spaceId &&
      resolvedUserId === userId &&
      resolvedSpaceId === spaceId,
  );

  useLayoutEffect(() => {
    activeUserIdRef.current = userId;
    requestIdRef.current += 1;
    accountRequestIdRef.current += 1;
  }, [userId]);

  const resetSubscriptionContext = useCallback(() => {
    setPlan(DEFAULT_SUBSCRIPTION_CONTEXT.plan);
    setSpacePlan(DEFAULT_SUBSCRIPTION_CONTEXT.spacePlan);
    setSpaceOwnerId(DEFAULT_SUBSCRIPTION_CONTEXT.spaceOwnerId);
    setOwnedSpaceCount(DEFAULT_SUBSCRIPTION_CONTEXT.ownedSpaceCount);
    setOwnedSpaceLimit(DEFAULT_SUBSCRIPTION_CONTEXT.ownedSpaceLimit);
    setCanCreateSpace(DEFAULT_SUBSCRIPTION_CONTEXT.canCreateSpace);
    setSpaceQuotaOverLimit(
      DEFAULT_SUBSCRIPTION_CONTEXT.spaceQuotaOverLimit,
    );
    setSpaceQuotaGraceActive(
      DEFAULT_SUBSCRIPTION_CONTEXT.spaceQuotaGraceActive,
    );
    setSpaceQuotaGraceEndsAt(
      DEFAULT_SUBSCRIPTION_CONTEXT.spaceQuotaGraceEndsAt,
    );
    setSpaceQuotaSelectedIds(
      DEFAULT_SUBSCRIPTION_CONTEXT.spaceQuotaSelectedIds,
    );
    setSpaceQuotaRestrictedIds(
      DEFAULT_SUBSCRIPTION_CONTEXT.spaceQuotaRestrictedIds,
    );
    setSpaceQuotaResolved(DEFAULT_SUBSCRIPTION_CONTEXT.spaceQuotaResolved);
    setCurrentSpaceWritable(
      DEFAULT_SUBSCRIPTION_CONTEXT.currentSpaceWritable,
    );
    setSpacePlanPeriodEnd(DEFAULT_SUBSCRIPTION_CONTEXT.spacePlanPeriodEnd);
    setMap3dEntitled(DEFAULT_SUBSCRIPTION_CONTEXT.canUseMap3D);
  }, []);

  const finishPlanLoad = useCallback(() => {
    hasLoadedPlanOnceRef.current = true;
    setLoading(false);
  }, []);

  const fetchAccountPlan = useCallback(async (scheduledRequestId?: number) => {
    const requestId =
      scheduledRequestId ?? ++accountRequestIdRef.current;
    if (requestId !== accountRequestIdRef.current) return;

    const targetUserId = userId;
    if (!targetUserId) {
      setAccountPlan(DEFAULT_SUBSCRIPTION_CONTEXT.accountPlan);
      setSubscription(DEFAULT_SUBSCRIPTION_CONTEXT.subscription);
      setResolvedAccountUserId(null);
      setAccountLoading(false);
      return;
    }

    setAccountLoading(true);
    try {
      const accountContext = await loadOwnAccountSubscription(targetUserId);
      if (
        requestId !== accountRequestIdRef.current ||
        activeUserIdRef.current !== targetUserId
      ) {
        return;
      }

      setAccountPlan(accountContext.accountPlan);
      setSubscription(accountContext.subscription);
      setResolvedAccountUserId(targetUserId);
    } catch (error) {
      if (
        requestId !== accountRequestIdRef.current ||
        activeUserIdRef.current !== targetUserId
      ) {
        return;
      }
      console.error("Could not load account subscription:", error);
      setResolvedAccountUserId(targetUserId);
    } finally {
      if (
        requestId === accountRequestIdRef.current &&
        activeUserIdRef.current === targetUserId
      ) {
        setAccountLoading(false);
      }
    }
  }, [userId]);

  const fetchPlan = useCallback(async (scheduledRequestId?: number) => {
    const requestId = scheduledRequestId ?? ++requestIdRef.current;

    if (requestId !== requestIdRef.current) return;

    if (!userId || !spaceId) {
      resetSubscriptionContext();
      setResolvedSpaceId(null);
      setResolvedUserId(null);
      finishPlanLoad();
      return;
    }

    const targetSpaceId = spaceId;
    const targetUserId = userId;

    if (!hasLoadedPlanOnceRef.current) setLoading(true);

    const { data, error } = await supabase.rpc(
      "get_subscription_context_for_space",
      { p_space_id: targetSpaceId },
    );

    if (
      requestId !== requestIdRef.current ||
      activeUserIdRef.current !== targetUserId
    ) return;

    if (error) {
      console.error("Could not load subscription context:", error);
      resetSubscriptionContext();
      setResolvedSpaceId(targetSpaceId);
      setResolvedUserId(targetUserId);
      finishPlanLoad();
      return;
    }

    const context = normalizeSubscriptionContext(data);
    setPlan(context.plan);
    setSpacePlan(context.spacePlan);
    setSpaceOwnerId(context.spaceOwnerId);
    setOwnedSpaceCount(context.ownedSpaceCount);
    setOwnedSpaceLimit(context.ownedSpaceLimit);
    setCanCreateSpace(context.canCreateSpace);
    setSpaceQuotaOverLimit(context.spaceQuotaOverLimit);
    setSpaceQuotaGraceActive(context.spaceQuotaGraceActive);
    setSpaceQuotaGraceEndsAt(context.spaceQuotaGraceEndsAt);
    setSpaceQuotaSelectedIds(context.spaceQuotaSelectedIds);
    setSpaceQuotaRestrictedIds(context.spaceQuotaRestrictedIds);
    setSpaceQuotaResolved(context.spaceQuotaResolved);
    setCurrentSpaceWritable(context.currentSpaceWritable);
    setSpacePlanPeriodEnd(context.spacePlanPeriodEnd);
    setMap3dEntitled(context.canUseMap3D);
    setResolvedSpaceId(targetSpaceId);
    setResolvedUserId(targetUserId);
    finishPlanLoad();
  }, [finishPlanLoad, resetSubscriptionContext, spaceId, userId]);

  const refetch = useCallback(async () => {
    await Promise.all([fetchAccountPlan(), fetchPlan()]);
  }, [fetchAccountPlan, fetchPlan]);

  useEffect(() => {
    const requestId = ++accountRequestIdRef.current;
    const timer = window.setTimeout(() => {
      void fetchAccountPlan(requestId);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      accountRequestIdRef.current += 1;
    };
  }, [fetchAccountPlan]);

  useEffect(() => {
    if (!spaceQuotaGraceEndsAt || !spaceQuotaGraceActive) return;

    let timer: number | null = null;
    const schedule = () => {
      const remaining =
        new Date(spaceQuotaGraceEndsAt).getTime() - Date.now() + 1000;
      if (remaining <= 0) {
        void fetchPlan();
        return;
      }
      timer = window.setTimeout(
        schedule,
        Math.min(remaining, 2_000_000_000),
      );
    };
    schedule();

    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [fetchPlan, spaceQuotaGraceActive, spaceQuotaGraceEndsAt]);

  useEffect(() => {
    const periodEnds = [subscription?.current_period_end, spacePlanPeriodEnd]
      .filter((value): value is string => typeof value === "string")
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);
    if (periodEnds.length === 0) return;

    const nextPeriodEnd = Math.min(...periodEnds);
    let timer: number | null = null;
    const schedule = () => {
      const remaining = nextPeriodEnd - Date.now() + 1000;
      if (remaining <= 0) {
        void refetch();
        return;
      }
      timer = window.setTimeout(
        schedule,
        Math.min(remaining, 2_000_000_000),
      );
    };
    schedule();

    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [refetch, spacePlanPeriodEnd, subscription?.current_period_end]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      void fetchPlan(requestId);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
    };
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
        if (!cancelled) void refetch();
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
  }, [refetch, spaceId]);

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
            void refetch();
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
  }, [refetch, spaceOwnerId]);

  const accountContextResolved = Boolean(
    userId && resolvedAccountUserId === userId,
  );
  const effectiveAccountPlan = accountContextResolved
    ? accountPlan
    : DEFAULT_SUBSCRIPTION_CONTEXT.accountPlan;
  const effectiveSubscription = accountContextResolved
    ? subscription
    : DEFAULT_SUBSCRIPTION_CONTEXT.subscription;
  const effectiveContext = activeSpaceContextResolved
    ? {
        plan,
        accountPlan: effectiveAccountPlan,
        spacePlan,
        spaceOwnerId,
        ownedSpaceCount,
        ownedSpaceLimit,
        canCreateSpace,
        spaceQuotaOverLimit,
        spaceQuotaGraceActive,
        spaceQuotaGraceEndsAt,
        spaceQuotaSelectedIds,
        spaceQuotaRestrictedIds,
        spaceQuotaResolved,
        currentSpaceWritable,
        subscription: effectiveSubscription,
        canUseMap3D: map3dEntitled,
      }
    : {
        ...DEFAULT_SUBSCRIPTION_CONTEXT,
        accountPlan: effectiveAccountPlan,
        subscription: effectiveSubscription,
      };
  const contextLoading = Boolean(userId && spaceId) &&
    (loading || !activeSpaceContextResolved);
  const accountContextLoading = Boolean(userId) &&
    (accountLoading || !accountContextResolved);
  const limits = PLAN_LIMITS[effectiveContext.plan];
  const accountReplayLimits = PLAN_LIMITS[effectiveContext.accountPlan];
  const activeSpaceWritable =
    activeSpaceContextResolved && effectiveContext.currentSpaceWritable;

  const checkout = useCallback(
    async (
      checkoutPlan: Exclude<PlanType, "free">,
      cycle: BillingCycle,
      locale: "en" | "vi",
    ) => {
      const { data, error } = await supabase.functions.invoke(
        "create-polar-checkout",
        {
          body: {
            plan: checkoutPlan,
            cycle,
            locale,
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
    async (code: string, locale: Lang) => {
      const { data, error } = await supabase.functions.invoke(
        "activate-code",
        {
          body: { code },
        },
      );

      if (error) {
        const responseError = await edgeResponseError(error);
        return {
          success: false,
          message: translate(locale, activationErrorKey(responseError ?? error.message)),
        };
      }

      if (data?.error) {
        return {
          success: false,
          message: translate(locale, activationErrorKey(data.error)),
        };
      }

      // Refetch plan after successful activation
      await refetch();
      return {
        success: true,
        message: translate(locale, "activation.success", {
          plan: data.plan === "pro" ? "Pro" : "Plus",
          date: formatLocalizedDate(data.expires_at, locale, {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        }),
        plan: data.plan,
        expires_at: data.expires_at,
      };
    },
    [refetch],
  );

  const saveSpaceQuotaSelection = useCallback(
    async (spaceIds: string[]) => {
      const { error } = await supabase.rpc(
        "set_owned_space_quota_selection",
        { p_space_ids: spaceIds },
      );
      if (error) throw error;
      await fetchPlan();
    },
    [fetchPlan],
  );

  const canUseMapStyle = useCallback(
    (styleId: string) => {
      if (contextLoading) return true; // Keep the current visual style while entitlements refresh.
      if (effectiveContext.plan === "pro") return true;
      if (effectiveContext.plan === "plus") {
        const idx = MAP_STYLE_IDS.indexOf(styleId);
        return idx >= 0 && idx < 10;
      }
      return FREE_STYLE_IDS.includes(styleId);
    },
    [contextLoading, effectiveContext.plan],
  );

  const value: SubscriptionContextValue = {
    plan: effectiveContext.plan,
    accountPlan: effectiveContext.accountPlan,
    spacePlan: effectiveContext.spacePlan,
    spaceOwnerId: effectiveContext.spaceOwnerId,
    ownedSpaceCount: effectiveContext.ownedSpaceCount,
    ownedSpaceLimit: effectiveContext.ownedSpaceLimit,
    canCreateSpace: effectiveContext.canCreateSpace,
    spaceQuotaOverLimit: effectiveContext.spaceQuotaOverLimit,
    spaceQuotaGraceActive: effectiveContext.spaceQuotaGraceActive,
    spaceQuotaGraceEndsAt: effectiveContext.spaceQuotaGraceEndsAt,
    spaceQuotaSelectedIds: effectiveContext.spaceQuotaSelectedIds,
    spaceQuotaRestrictedIds: effectiveContext.spaceQuotaRestrictedIds,
    spaceQuotaResolved: effectiveContext.spaceQuotaResolved,
    currentSpaceWritable: activeSpaceWritable,
    subscription: effectiveContext.subscription,
    loading: contextLoading,
    accountLoading: accountContextLoading,
    limits,
    isPremium: effectiveContext.plan !== "free",
    canUploadVideo: activeSpaceWritable && limits.video,
    canUseMapStyle,
    canUseMap3D: contextLoading ? true : effectiveContext.canUseMap3D,
    canCreatePin: (currentCount: number) =>
      activeSpaceWritable && currentCount < limits.pins,
    canAddPhoto: (currentCount: number) =>
      activeSpaceWritable && currentCount < limits.photosPerPin,
    canCreateCategory: (currentCount: number) =>
      activeSpaceWritable && currentCount < limits.customCategories,
    canCreateCollection: (currentCount: number) =>
      activeSpaceWritable && currentCount < limits.collections,
    hasWatermark: limits.shareCardWatermark,
    canUseReplayTemplate: (templateId: ReplayTemplateId) =>
      accountReplayLimits.replayTemplates.includes(templateId),
    canCustomizeReplay: accountReplayLimits.replayCustomization,
    canUseAdvancedReplayStyling: accountReplayLimits.replayAdvancedStyling,
    replayHasWatermark: accountReplayLimits.replayWatermark,
    refetch,
    saveSpaceQuotaSelection,
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
