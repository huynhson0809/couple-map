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
  useLayoutEffect(() => {
    activeUserIdRef.current = userId;
    requestIdRef.current += 1;
    loadingRef.current = false;
  }, [userId]);
  useEffect(() => {
    onNewNotifRef.current = onNewNotification;
  });

  const setNotificationState = useCallback(
    (updater: (current: AppNotification[]) => AppNotification[]) => {
      setNotifications((current) => {
        const next = updater(current);
        notificationsRef.current = next;
        return next;
      });
    },
    [],
  );

  const fetchNotifications = useCallback(
    async (reset = false) => {
      if (!userId || !activeSpaceId) return;
      if (loadingRef.current) return;
      const targetUserId = userId;

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
        ) return;

        const { rows, unreadCount: nextUnreadCount } =
          normalizeFeedPayload(data);

        const replacingAccount = dataUserIdRef.current !== targetUserId;
        if (replacingAccount) {
          notificationsRef.current = [];
          nextOffsetRef.current = 0;
        }
        dataUserIdRef.current = targetUserId;
        setDataUserId(targetUserId);
        nextOffsetRef.current = reset || replacingAccount
          ? rows.length
          : nextOffsetRef.current + rows.length;
        setNotificationState((prev) =>
          reset || replacingAccount
            ? mergeNotifications([], rows)
            : mergeNotifications(prev, rows),
        );
        setHasMore(rows.length === PAGE_SIZE);
        setUnreadCount(nextUnreadCount);
      } finally {
        if (requestId === requestIdRef.current) {
          loadingRef.current = false;
          setLoading(false);
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
    () => fetchNotifications(true),
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
            setUnreadCount((count) => replacingAccount ? 1 : count + 1);
            onNewNotifRef.current?.(newNotif);
          } else if (replacingAccount) {
            setUnreadCount(0);
          }
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [instanceId, setNotificationState, userId]);

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
