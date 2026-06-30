import { useCallback, useEffect, useId, useRef, useState } from "react";
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

function notificationBelongsToActiveSpace(
  notification: AppNotification,
  activeSpaceId: string,
) {
  return (
    notification.space_id === activeSpaceId ||
    (notification.space_id === null && notification.couple_id === activeSpaceId)
  );
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
  const loadingRef = useRef(false);
  const nextOffsetRef = useRef(0);
  const notificationsRef = useRef<AppNotification[]>([]);
  const requestIdRef = useRef(0);
  const onNewNotifRef = useRef(onNewNotification);
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

        if (error || requestId !== requestIdRef.current) return;

        const { rows, unreadCount: nextUnreadCount } =
          normalizeFeedPayload(data);

        nextOffsetRef.current = reset
          ? rows.length
          : nextOffsetRef.current + rows.length;
        setNotificationState((prev) =>
          reset ? mergeNotifications([], rows) : mergeNotifications(prev, rows),
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
      if (!userId || !activeSpaceId) return;
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

      setNotificationState((prev) =>
        prev.map((notification) =>
          notification.id === id
            ? { ...notification, read: true }
            : notification,
        ),
      );
      if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
    },
    [activeSpaceId, setNotificationState, userId],
  );

  const markAllAsRead = useCallback(async () => {
    if (!userId || !activeSpaceId) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .or(
        `space_id.eq.${activeSpaceId},and(space_id.is.null,couple_id.eq.${activeSpaceId})`,
      )
      .eq("read", false);

    if (error) return;

    setNotificationState((prev) =>
      prev.map((notification) => ({ ...notification, read: true })),
    );
    setUnreadCount(0);
  }, [activeSpaceId, setNotificationState, userId]);

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
      notificationsRef.current = [];
      nextOffsetRef.current = 0;
      loadingRef.current = false;
      setNotifications([]);
      setUnreadCount(0);
      setHasMore(Boolean(userId && activeSpaceId));
      setLoading(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeSpaceId, userId]);

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
    if (!userId || !activeSpaceId) return;

    const channel = supabase
      .channel(`notifications:${userId}:${activeSpaceId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          if (!notificationBelongsToActiveSpace(newNotif, activeSpaceId)) return;
          const alreadyLoaded = notificationsRef.current.some(
            (notification) => notification.id === newNotif.id,
          );

          setNotificationState((prev) => mergeNotifications(prev, [newNotif]));
          if (!alreadyLoaded && !newNotif.read) {
            setUnreadCount((count) => count + 1);
            onNewNotifRef.current?.(newNotif);
          }
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [activeSpaceId, instanceId, setNotificationState, userId]);

  return {
    notifications,
    unreadCount,
    loading,
    hasMore,
    fetchMore,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}
