import type { I18nKey } from "../hooks/I18nContext";
import type { AppNotification } from "../types";

type Translate = (
  key: I18nKey,
  values?: Record<string, string | number>,
) => string;

const LEGACY_ACTIONS = [
  " đã thêm một kỷ niệm mới",
  " đã đánh dấu yêu thích kỷ niệm của bạn",
  " đã bày tỏ cảm xúc với bình luận của bạn",
  " đã bày tỏ cảm xúc",
  " đã trả lời bình luận của bạn",
  " đã bình luận",
  " nhắc nhẹ",
  " added a new memory",
  " favorited your memory",
  " reacted to your comment",
  " reacted",
  " replied to your comment",
  " commented",
  " sent a gentle reminder",
];

function dataString(
  notification: AppNotification,
  key: string,
): string | null {
  const value = notification.data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function legacyActorName(title: string) {
  for (const action of LEGACY_ACTIONS) {
    if (title.endsWith(action)) return title.slice(0, -action.length).trim();
  }

  const vietnameseIndex = title.lastIndexOf(" đã ");
  if (vietnameseIndex > 0) return title.slice(0, vietnameseIndex).trim();
  return title;
}

function notificationAction(notification: AppNotification) {
  const explicitAction = dataString(notification, "action");
  if (explicitAction) return explicitAction;

  if (notification.type === "new_pin") return "new_pin";
  if (notification.type === "reaction") {
    if (notification.data?.comment_id) return "comment_reaction";
    if (notification.data?.action === "favorite") return "favorite";
    return "reaction";
  }
  if (notification.type === "comment") {
    return notification.data?.parent_comment_id ? "comment_reply" : "comment";
  }
  if (
    notification.type === "streak_reminder" &&
    notification.data?.source === "nudge"
  ) {
    return "nudge";
  }
  return null;
}

export function localizedNotificationCopy(
  notification: AppNotification,
  t: Translate,
) {
  if (notification.type === "support_reply") {
    return { title: t("notif.supportReply"), body: notification.body };
  }
  if (notification.type === "space_quota_warning") {
    return {
      title: t("notif.spaceQuotaWarning"),
      body: t("notif.spaceQuotaWarningBody"),
    };
  }
  if (notification.type === "space_quota_restricted") {
    return {
      title: t("notif.spaceQuotaRestricted"),
      body: t("notif.spaceQuotaRestrictedBody"),
    };
  }
  if (notification.type === "space_quota_restored") {
    return {
      title: t("notif.spaceQuotaRestored"),
      body: t("notif.spaceQuotaRestoredBody"),
    };
  }

  const action = notificationAction(notification);
  if (!action) {
    return { title: notification.title, body: notification.body };
  }

  const actorName =
    dataString(notification, "actor_name") ||
    legacyActorName(notification.title) ||
    t("notif.actorFallback");
  const actionKeys: Record<string, I18nKey> = {
    new_pin: "notif.actionNewPin",
    reaction: "notif.actionReaction",
    favorite: "notif.actionFavorite",
    comment: "notif.actionComment",
    comment_reply: "notif.actionCommentReply",
    comment_reaction: "notif.actionCommentReaction",
    nudge: "notif.actionNudge",
  };
  const actionKey = actionKeys[action];
  if (!actionKey) {
    return { title: notification.title, body: notification.body };
  }

  return {
    title: `${actorName} ${t(actionKey)}`,
    body: action === "nudge" ? t("notif.nudgeBody") : notification.body,
  };
}
