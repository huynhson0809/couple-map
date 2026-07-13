import { createContext, useCallback, useContext } from "react";
import { useNotificationFeed } from "./useNotificationFeed";
import { useCoupleCtx } from "./CoupleContext";
import { useSpaceCtx } from "./SpaceContext";
import { useToast } from "./ToastContext";
import { useI18n } from "./I18nContext";
import type { AppNotification } from "../types";

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
        const quotaTitle =
          notif.type === "space_quota_warning"
            ? t("notif.spaceQuotaWarning")
            : notif.type === "space_quota_restricted"
              ? t("notif.spaceQuotaRestricted")
              : notif.type === "space_quota_restored"
                ? t("notif.spaceQuotaRestored")
                : null;
        const quotaBody =
          notif.type === "space_quota_warning"
            ? t("notif.spaceQuotaWarningBody")
            : notif.type === "space_quota_restricted"
              ? t("notif.spaceQuotaRestrictedBody")
              : notif.type === "space_quota_restored"
                ? t("notif.spaceQuotaRestoredBody")
                : null;
        showToast({
          type: "info",
          title:
            quotaTitle ?? (notif.type === "support_reply"
              ? t("notif.supportReply")
              : (notif.title ?? "")),
          message: quotaBody ?? notif.body ?? undefined,
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
