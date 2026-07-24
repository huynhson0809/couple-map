import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localizedNotificationCopy } from "../src/lib/notificationCopy.ts";
import {
  interactionNotificationCopy,
  nudgeNotificationCopy,
} from "../supabase/functions/_shared/notification-copy.ts";

function readProjectFile(path) {
  return readFileSync(resolve(path), "utf8");
}

const translations = {
  en: {
    "notif.actionNewPin": "added a new memory",
    "notif.actionReaction": "reacted",
    "notif.actionFavorite": "favorited your memory",
    "notif.actionComment": "commented",
    "notif.actionCommentReply": "replied to your comment",
    "notif.actionCommentReaction": "reacted to your comment",
    "notif.actionNudge": "sent a gentle reminder",
    "notif.nudgeBody": "Today's shared streak is still waiting for your moment.",
    "notif.actorFallback": "A map member",
  },
  vi: {
    "notif.actionNewPin": "đã thêm một kỷ niệm mới",
    "notif.actionReaction": "đã bày tỏ cảm xúc",
    "notif.actionFavorite": "đã đánh dấu yêu thích kỷ niệm của bạn",
    "notif.actionComment": "đã bình luận",
    "notif.actionCommentReply": "đã trả lời bình luận của bạn",
    "notif.actionCommentReaction": "đã bày tỏ cảm xúc với bình luận của bạn",
    "notif.actionNudge": "nhắc nhẹ",
    "notif.nudgeBody": "Chuỗi chung hôm nay vẫn đang chờ khoảnh khắc của bạn.",
    "notif.actorFallback": "Một thành viên",
  },
};

function translator(locale) {
  return (key) => translations[locale][key] ?? key;
}

const structuredNotification = {
  id: "notification-id",
  user_id: "recipient-id",
  couple_id: "couple-id",
  space_id: "space-id",
  type: "comment",
  title: "Legacy title must not control rendering",
  body: "A short comment",
  data: {
    action: "comment_reply",
    actor_name: "Sterling",
    pin_id: "pin-id",
  },
  read: false,
  created_at: "2026-07-22T00:00:00.000Z",
};

assert.deepEqual(
  localizedNotificationCopy(structuredNotification, translator("en")),
  { title: "Sterling replied to your comment", body: "A short comment" },
  "Structured notification data should render in the active English UI locale.",
);
assert.deepEqual(
  localizedNotificationCopy(structuredNotification, translator("vi")),
  { title: "Sterling đã trả lời bình luận của bạn", body: "A short comment" },
  "The same stored notification should render in Vietnamese without rewriting DB rows.",
);

assert.deepEqual(
  interactionNotificationCopy({
    locale: "en",
    eventType: "favorite",
    actorName: "Alex",
    pinTitle: "Summer in Da Nang",
    interactionBody: null,
    reaction: "",
  }),
  {
    title: "⭐ Alex favorited your memory",
    body: "Summer in Da Nang",
    locale: "en",
    actorName: "Alex",
  },
);
assert.equal(
  interactionNotificationCopy({
    locale: "vi",
    eventType: "memory_added",
    actorName: null,
    pinTitle: null,
    interactionBody: null,
    reaction: "",
  }).title,
  "📍 Một thành viên đã ghim",
);

assert.deepEqual(nudgeNotificationCopy("en", "Alex"), {
  locale: "en",
  senderName: "Alex",
  title: "Alex sent a gentle reminder",
  body: "Today's shared streak is still waiting for your moment.",
});
assert.deepEqual(nudgeNotificationCopy("vi", "Alex"), {
  locale: "vi",
  senderName: "Alex",
  title: "Alex nhắc nhẹ",
  body: "Chuỗi chung hôm nay vẫn đang chờ khoảnh khắc của bạn.",
});

const sendPush = readProjectFile("supabase/functions/send-push/index.ts");
const sendNudge = readProjectFile("supabase/functions/send-nudge/index.ts");
const useNudge = readProjectFile("src/hooks/useNudge.ts");
const streakCard = readProjectFile("src/components/streak/StreakCard.tsx");
const wishlistPage = readProjectFile("src/pages/WishlistPage.tsx");
const notificationBell = readProjectFile("src/components/ui/NotificationBell.tsx");
const notificationsPage = readProjectFile("src/pages/NotificationsPage.tsx");
const notificationPreferences = readProjectFile(
  "src/hooks/useNotificationPreferences.ts",
);
const notificationFeed = readProjectFile("src/hooks/useNotificationFeed.ts");
const pushSubscription = readProjectFile("src/hooks/usePushSubscription.ts");
const authHook = readProjectFile("src/hooks/useAuth.ts");
const migration = readProjectFile(
  "supabase/migration_localized_notifications.sql",
);

assert.match(
  sendPush,
  /\.select\("locale"\)/,
  "Interaction pushes must load the recipient locale.",
);
assert.match(sendPush, /interactionNotificationCopy/);
assert.match(sendNudge, /nudgeNotificationCopy/);
assert.match(sendNudge, /normalizeReminderTimeZone/);
assert.doesNotMatch(sendNudge, /Asia\/Ho_Chi_Minh/);
assert.doesNotMatch(useNudge, /Asia\/Ho_Chi_Minh/);
assert.match(useNudge, /error: t\("streak\.nudgeFailed"\)/);
assert.match(useNudge, /snapshot\.coupleId === coupleId/);
assert.match(useNudge, /requestId !== checkRequestRef\.current/);
assert.doesNotMatch(useNudge, /Gửi nhắc thất bại|Bạn đã nhắc hôm nay rồi/);
assert.match(streakCard, /nudgeError[\s\S]*role="alert"/);
assert.match(wishlistPage, /nudgeError=\{nudge\.error\}/);
assert.match(notificationBell, /localizedNotificationCopy\(n, t\)/);
assert.match(notificationBell, /formatRelativeTime\(n\.created_at, lang\)/);
assert.doesNotMatch(notificationBell, /Thông báo|Chưa có thông báo|Đang tải\.\.\./);
assert.match(notificationsPage, /notif\.sectionYesterday/);
assert.match(notificationsPage, /yesterdayItems\.push\(n\)/);
assert.match(notificationsPage, /now\.getDate\(\) - 1/);
assert.doesNotMatch(
  notificationsPage,
  /startOfToday - 86_400_000/,
  "Yesterday grouping must use local calendar boundaries across DST changes.",
);
assert.match(
  notificationPreferences,
  /const \{ data, error \} = await supabase[\s\S]*if \(error\)[\s\S]*if \(data\)/,
  "A failed preference read must not be mistaken for a missing row and overwritten with defaults.",
);
assert.match(
  notificationFeed,
  /dataUserId === userId/,
  "Notification rows and unread counts must be hidden when they belong to another account.",
);
assert.match(
  notificationFeed,
  /activeUserIdRef\.current !== targetUserId/,
  "Late notification reads and writes from a previous account must be ignored.",
);
assert.match(
  notificationPreferences,
  /snapshot && snapshot\.userId === userId/,
  "Notification preferences must be scoped to the authenticated account.",
);
assert.match(
  notificationPreferences,
  /requestId !== requestIdRef\.current/,
  "Late preference requests must not overwrite a newer account snapshot.",
);
assert.match(
  pushSubscription,
  /\.eq\('user_id', targetUserId\)[\s\S]*\.eq\('endpoint', subscription\.endpoint\)/,
  "A browser push endpoint must be verified against the active account.",
);
assert.match(
  pushSubscription,
  /snapshot && snapshot\.userId === userId/,
  "Push UI state must be scoped to the active account.",
);
assert.match(
  authHook,
  /removeCurrentBrowserPushSubscription\(user\?\.id\)[\s\S]*supabase\.auth\.signOut\(\)/,
  "Signing out should stop the device from receiving the previous account's push notifications.",
);

assert.match(migration, /notification_action_title/);
assert.match(migration, /'actor_name'/);
assert.match(migration, /'action'/);
assert.match(migration, /from pg_timezone_names/);
assert.doesNotMatch(migration, /Asia\/Ho_Chi_Minh/);

console.log("international notifications contract: ok");
