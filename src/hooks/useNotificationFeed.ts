import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import type { AppNotification } from "../types";

const PAGE_SIZE = 30;

type NotificationFeedPayload = {
  notifications?: AppNotification[];
  unreadCount?: number | string | null;
};

function byNewestFirst(a: AppNotification, b: AppNotification) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function normalizeFeedPayload(data: unknown): {
  rows: AppNotification[];
  unreadCount: number;
} {
  const payload = (data ?? {}) as NotificationFeedPayload;
  const rows = Array.isArray(payload.notifications)
    ? payload.notifications
    : [];
  const unreadCount = Number(payload.unreadCount ?? 0);

  return {
    rows,
    unreadCount: Number.isFinite(unreadCount) ? unreadCount : 0,
  };
}

function mergeNotifications(
  current: AppNotification[],
  incoming: AppNotification[],
) {
  const byId = new Map<string, AppNotification>();

  for (const notification of current) {
    byId.set(notification.id, notification);
  }

  for (const notification of incoming) {
    byId.set(notification.id, notification);
  }

  return Array.from(byId.values()).sort(byNewestFirst);
}

export function useNotificationFeed(
  userId: string | undefined,
  activeSpaceId: string | null | undefined,
  onNewNotification?: (notif: AppNotification) => void,
) {
  const instanceId = useId();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [dataUserId, setDataUserId] = useState(userId);
  const loadingRef = useRef(false);
  const nextOffsetRef = useRef(0);
  const notificationsRef = useRef<AppNotification[]>([]);
  const requestIdRef = useRef(0);
  const activeUserIdRef = useRef(userId);
  const dataUserIdRef = useRef(userId);
  const onNewNotifRef = useRef(onNewNotification);
  const refreshPendingRef = useRef(false);
  const liveRevisionRef = useRef(0);
  useLayoutEffect(() => {
    activeUserIdRef.current = userId;
    requestIdRef.current += 1;
    loadingRef.current = false;
    refreshPendingRef.current = false;
  }, [userId]);
  useEffect(() => {
    onNewNotifRef.current = onNewNotification;
  });

  const setNotificationState = useCallback(
    (updater: (current: AppNotification[]) => AppNotification[]) => {
      const next = updater(notificationsRef.current);
      notificationsRef.current = next;
      setNotifications(next);
    },
    [],
  );

  const fetchNotifications = useCallback(
    async function loadNotifications(reset = false, preserve = false) {
      if (!userId || !activeSpaceId) return;
      if (loadingRef.current) {
        if (reset) refreshPendingRef.current = true;
        return;
      }
      const targetUserId = userId;
      const liveRevision = liveRevisionRef.current;

      loadingRef.current = true;
      setLoading(true);
      const requestId = ++requestIdRef.current;
      const offset = reset ? 0 : nextOffsetRef.current;

      try {
        const { data, error } = await supabase.rpc("get_notification_feed", {
          p_limit: PAGE_SIZE,
          p_offset: offset,
          p_space_id: activeSpaceId,
        });

        if (
          error ||
          requestId !== requestIdRef.current ||
          activeUserIdRef.current !== targetUserId
        )
          return;

        if (liveRevision !== liveRevisionRef.current) {
          refreshPendingRef.current = true;
          return;
        }

        const { rows, unreadCount: nextUnreadCount } =
          normalizeFeedPayload(data);

        const replacingAccount = dataUserIdRef.current !== targetUserId;
        if (replacingAccount) {
          notificationsRef.current = [];
          nextOffsetRef.current = 0;
        }
        dataUserIdRef.current = targetUserId;
        setDataUserId(targetUserId);
        nextOffsetRef.current =
          replacingAccount || (reset && !preserve)
            ? rows.length
            : reset
              ? Math.max(nextOffsetRef.current, rows.length)
              : nextOffsetRef.current + rows.length;
        setNotificationState((prev) =>
          (reset && !preserve) || replacingAccount
            ? mergeNotifications([], rows)
            : mergeNotifications(prev, rows),
        );
        if (!preserve || nextOffsetRef.current <= PAGE_SIZE) {
          setHasMore(rows.length === PAGE_SIZE);
        }
        setUnreadCount(nextUnreadCount);
      } catch (error) {
        console.warn("Could not refresh notifications:", error);
      } finally {
        if (requestId === requestIdRef.current) {
          loadingRef.current = false;
          setLoading(false);
          if (refreshPendingRef.current) {
            refreshPendingRef.current = false;
            void loadNotifications(true, true);
          }
        }
      }
    },
    [activeSpaceId, setNotificationState, userId],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      if (!userId) return;
      const wasUnread = notificationsRef.current.some(
        (notification) => notification.id === id && !notification.read,
      );
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("read", false);

      if (error) return;
      if (activeUserIdRef.current !== userId) return;

      liveRevisionRef.current += 1;
      setNotificationState((prev) =>
        prev.map((notification) =>
          notification.id === id
            ? { ...notification, read: true }
            : notification,
        ),
      );
      if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
    },
    [setNotificationState, userId],
  );

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    const targetUserId = userId;
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);

    if (error) return;
    if (activeUserIdRef.current !== targetUserId) return;

    liveRevisionRef.current += 1;
    setNotificationState((prev) =>
      prev.map((notification) => ({ ...notification, read: true })),
    );
    setUnreadCount(0);
  }, [setNotificationState, userId]);

  const fetchMore = useCallback(
    () => fetchNotifications(false),
    [fetchNotifications],
  );

  const refresh = useCallback(
    () => fetchNotifications(true, true),
    [fetchNotifications],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      requestIdRef.current += 1;
      dataUserIdRef.current = userId;
      setDataUserId(userId);
      notificationsRef.current = [];
      nextOffsetRef.current = 0;
      loadingRef.current = false;
      setNotifications([]);
      setUnreadCount(0);
      setHasMore(Boolean(userId));
      setLoading(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    if (!userId || !activeSpaceId) return;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeSpaceId, refresh, userId]);

  useEffect(() => {
    if (!userId || !activeSpaceId) return;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const handleMessage = (event: MessageEvent) => {
      if (
        ["NOTIFICATION_RECEIVED", "NOTIFICATION_CLICK"].includes(
          event.data?.type,
        )
      ) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("pageshow", refreshVisible);
    window.addEventListener("online", refreshVisible);
    navigator.serviceWorker?.addEventListener("message", handleMessage);
    const timer = window.setInterval(refreshVisible, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("pageshow", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      navigator.serviceWorker?.removeEventListener("message", handleMessage);
      window.clearInterval(timer);
      requestIdRef.current += 1;
      loadingRef.current = false;
      refreshPendingRef.current = false;
    };
  }, [activeSpaceId, refresh, userId]);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (activeUserIdRef.current !== userId) return;
          liveRevisionRef.current += 1;
          const newNotif = payload.new as AppNotification;
          const replacingAccount = dataUserIdRef.current !== userId;
          if (replacingAccount) {
            dataUserIdRef.current = userId;
            notificationsRef.current = [];
            nextOffsetRef.current = 0;
            setDataUserId(userId);
            setHasMore(true);
          }
          const alreadyLoaded = notificationsRef.current.some(
            (notification) => notification.id === newNotif.id,
          );

          setNotificationState((prev) =>
            mergeNotifications(replacingAccount ? [] : prev, [newNotif]),
          );
          if (!alreadyLoaded && !newNotif.read) {
            setUnreadCount((count) => (replacingAccount ? 1 : count + 1));
            onNewNotifRef.current?.(newNotif);
          } else if (replacingAccount) {
            setUnreadCount(0);
          }
          if (!alreadyLoaded && nextOffsetRef.current > 0)
            nextOffsetRef.current += 1;
          void refresh();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });

    return () => {
      void channel.unsubscribe();
    };
  }, [instanceId, refresh, setNotificationState, userId]);

  const payloadMatchesUser = dataUserId === userId;

  return {
    notifications: payloadMatchesUser ? notifications : [],
    unreadCount: payloadMatchesUser ? unreadCount : 0,
    loading: userId ? loading || !payloadMatchesUser : false,
    hasMore: payloadMatchesUser ? hasMore : Boolean(userId),
    fetchMore,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}
