import {
  normalizeReminderLocale,
  type ReminderLocale,
} from "./reminder-local-time.ts";

export type InteractionNotificationEvent =
  | "memory_added"
  | "reaction"
  | "favorite"
  | "comment"
  | "comment_reply"
  | "comment_reaction";

export function interactionNotificationCopy({
  locale: localeValue,
  eventType,
  actorName: actorNameValue,
  pinTitle: pinTitleValue,
  interactionBody,
  reaction,
}: {
  locale: unknown;
  eventType: InteractionNotificationEvent;
  actorName: string | null | undefined;
  pinTitle: string | null | undefined;
  interactionBody: string | null;
  reaction: string;
}) {
  const locale = normalizeReminderLocale(localeValue);
  const actorName =
    actorNameValue?.trim() ||
    (locale === "vi" ? "Một thành viên" : "A map member");
  const pinTitle =
    pinTitleValue?.trim() || (locale === "vi" ? "một kỷ niệm" : "a memory");
  const bodyPreview = interactionBody
    ? `“${interactionBody.slice(0, 80)}”`
    : pinTitle;

  const titles: Record<
    ReminderLocale,
    Record<InteractionNotificationEvent, string>
  > = {
    en: {
      memory_added: `📍 ${actorName} added a memory`,
      reaction: `💞 ${actorName} reacted`,
      favorite: `⭐ ${actorName} favorited your memory`,
      comment: `💬 ${actorName} commented`,
      comment_reply: `↩️ ${actorName} replied to your comment`,
      comment_reaction: `💞 ${actorName} reacted to your comment`,
    },
    vi: {
      memory_added: `📍 ${actorName} đã ghim`,
      reaction: `💞 ${actorName} đã bày tỏ cảm xúc`,
      favorite: `⭐ ${actorName} đã đánh dấu yêu thích`,
      comment: `💬 ${actorName} đã bình luận`,
      comment_reply: `↩️ ${actorName} đã trả lời bình luận`,
      comment_reaction: `💞 ${actorName} đã bày tỏ cảm xúc với bình luận`,
    },
  };

  const body =
    eventType === "reaction"
      ? `${reaction} · ${pinTitle}`
      : eventType === "favorite" || eventType === "memory_added"
        ? pinTitle
        : eventType === "comment" || eventType === "comment_reply"
          ? bodyPreview
          : `${reaction} · ${bodyPreview}`;

  return { title: titles[locale][eventType], body, locale, actorName };
}

export function nudgeNotificationCopy(
  localeValue: unknown,
  senderNameValue: string | null | undefined,
) {
  const locale = normalizeReminderLocale(localeValue);
  const senderName =
    senderNameValue?.trim() ||
    (locale === "vi" ? "Một thành viên" : "A map member");

  return locale === "vi"
    ? {
        locale,
        senderName,
        title: `${senderName} nhắc nhẹ`,
        body: "Chuỗi chung hôm nay vẫn đang chờ khoảnh khắc của bạn.",
      }
    : {
        locale,
        senderName,
        title: `${senderName} sent a gentle reminder`,
        body: "Today's shared streak is still waiting for your moment.",
      };
}
