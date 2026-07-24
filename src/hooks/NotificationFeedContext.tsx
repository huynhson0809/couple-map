import { createContext, useCallback, useContext } from "react";
import { useNotificationFeed } from "./useNotificationFeed";
import { useCoupleCtx } from "./CoupleContext";
import { useSpaceCtx } from "./SpaceContext";
import { useToast } from "./ToastContext";
import { useI18n } from "./I18nContext";
import type { AppNotification } from "../types";
import { localizedNotificationCopy } from "../lib/notificationCopy";

type NotifFeed = ReturnType<typeof useNotificationFeed>;

const Ctx = createContext<NotifFeed | null>(null);

const TOAST_TYPES = new Set([
  "reaction",
  "comment",
  "streak_reminder",
  "support_reply",
  "space_quota_warning",
  "space_quota_restricted",
  "space_quota_restored",
]);

export function NotificationFeedProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = useCoupleCtx();
  const { activeSpace } = useSpaceCtx();
  const { showToast } = useToast();
  const { t } = useI18n();

  const onNewNotification = useCallback(
    (notif: AppNotification) => {
      if (TOAST_TYPES.has(notif.type)) {
        const copy = localizedNotificationCopy(notif, t);
        showToast({
          type: "info",
          title: copy.title,
          message: copy.body ?? undefined,
          durationMs: 4000,
        });
      }
    },
    [showToast, t],
  );

  const feed = useNotificationFeed(
    profile?.id,
    activeSpace?.id,
    onNewNotification,
  );
  return <Ctx.Provider value={feed}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifFeed(): NotifFeed {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useNotifFeed must be inside NotificationFeedProvider");
  return ctx;
}
