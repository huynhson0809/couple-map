import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  MessageCircle,
  Flame,
  Heart,
  MapPin,
} from "lucide-react";
import { useNotifFeed } from "../hooks/NotificationFeedContext";
import { useI18n } from "../hooks/I18nContext";
import type { AppNotification } from "../types";

const VI_ACTIONS = [
  " đã thêm một kỷ niệm mới",
  " đã bày tỏ cảm xúc",
  " đã bình luận",
  " đã hoàn thành streak",
  " streak đã bị mất",
];

function extractActorName(title: string): string {
  for (const action of VI_ACTIONS) {
    if (title.includes(action)) return title.split(action)[0];
  }
  // Fallback: take everything before last " đã "
  const idx = title.lastIndexOf(" đã ");
  if (idx > 0) return title.substring(0, idx);
  return title;
}

function notifTitle(n: AppNotification, t: (k: string) => string): string {
  const name = extractActorName(n.title);
  switch (n.type) {
    case "new_pin":
      return `${name} ${t("notif.actionNewPin")}`;
    case "reaction":
      return `${name} ${t("notif.actionReaction")}`;
    case "comment":
      return `${name} ${t("notif.actionComment")}`;
    default:
      return n.title;
  }
}

function timeAgo(dateStr: string, t: (k: string) => string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("notif.justNow");
  if (minutes < 60) return `${minutes}${t("notif.minutesAgo")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t("notif.hoursAgo")}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}${t("notif.daysAgo")}`;
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "short",
  });
}

function notifIcon(type: AppNotification["type"]) {
  switch (type) {
    case "new_pin":
      return <MapPin size={18} />;
    case "reaction":
      return <Heart size={18} />;
    case "comment":
      return <MessageCircle size={18} />;
    case "streak_reminder":
      return <Flame size={18} />;
    case "streak_complete":
      return <Flame size={18} />;
    case "streak_broken":
      return <Flame size={18} />;
    default:
      return <Bell size={18} />;
  }
}

function notifColor(type: AppNotification["type"]) {
  switch (type) {
    case "new_pin":
      return "#ff676d";
    case "reaction":
      return "#e91e63";
    case "comment":
      return "#2196f3";
    case "streak_reminder":
      return "#ff9800";
    case "streak_complete":
      return "#4caf50";
    case "streak_broken":
      return "#f44336";
    default:
      return "#666";
  }
}

type Section = { label: string; items: AppNotification[] };

function groupByTime(
  items: AppNotification[],
  t: (k: string) => string,
): Section[] {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  const newItems: AppNotification[] = [];
  const todayItems: AppNotification[] = [];
  const earlierItems: AppNotification[] = [];

  for (const n of items) {
    const ts = new Date(n.created_at).getTime();
    if (ts >= startOfToday && !n.read) {
      newItems.push(n);
    } else if (ts >= startOfToday) {
      todayItems.push(n);
    } else if (ts >= startOfYesterday) {
      todayItems.push(n);
    } else {
      earlierItems.push(n);
    }
  }

  const sections: Section[] = [];
  if (newItems.length)
    sections.push({ label: t("notif.sectionNew"), items: newItems });
  if (todayItems.length)
    sections.push({ label: t("notif.sectionToday"), items: todayItems });
  if (earlierItems.length)
    sections.push({ label: t("notif.sectionEarlier"), items: earlierItems });
  return sections;
}

export function NotificationsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const {
    notifications,
    unreadCount,
    loading,
    hasMore,
    fetchMore,
    markAsRead,
    markAllAsRead,
  } = useNotifFeed();
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      tab === "unread" ? notifications.filter((n) => !n.read) : notifications,
    [tab, notifications],
  );

  const sections = useMemo(() => groupByTime(filtered, t), [filtered, t]);

  const handleScroll = useCallback(() => {
    if (!listRef.current || loading || !hasMore) return;
    const el = listRef.current;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchMore();
    }
  }, [loading, hasMore, fetchMore]);

  function handleNotifClick(n: AppNotification) {
    if (!n.read) markAsRead(n.id);
    const pinId = n.data?.pin_id as string | undefined;
    if (pinId && ["new_pin", "reaction", "comment"].includes(n.type)) {
      navigate("/timeline", { state: { openPinId: pinId } });
    } else if (n.type === "streak_reminder" || n.type === "streak_broken") {
      navigate("/wishlist");
    }
  }

  return (
    <div
      className="page page-notifications"
      ref={listRef}
      onScroll={handleScroll}
    >
      <header className="page-header notif-header-row">
        <h1>{t("nav.notifications")}</h1>
        {unreadCount > 0 && (
          <button
            type="button"
            className="notif-mark-all-btn"
            onClick={markAllAsRead}
          >
            <CheckCheck size={16} />
            <span>{t("notif.markRead")}</span>
          </button>
        )}
      </header>

      <div className="notif-tabs">
        <button
          type="button"
          className={`notif-tab ${tab === "all" ? "active" : ""}`}
          onClick={() => setTab("all")}
        >
          {t("notif.all")}
        </button>
        <button
          type="button"
          className={`notif-tab ${tab === "unread" ? "active" : ""}`}
          onClick={() => setTab("unread")}
        >
          {t("notif.unread")}
        </button>
      </div>

      {filtered.length === 0 && !loading && (
        <div className="empty-state">
          <Bell size={40} strokeWidth={1.5} className="muted" />
          <p className="muted">
            {tab === "unread" ? t("notif.noUnread") : t("notif.noNotif")}
          </p>
        </div>
      )}

      <div className="notif-list">
        {sections.map((section) => (
          <div key={section.label} className="notif-section">
            <div className="notif-section-label">{section.label}</div>
            {section.items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`notif-item ${n.read ? "" : "unread"}`}
                onClick={() => handleNotifClick(n)}
              >
                <span
                  className="notif-item-icon"
                  style={{
                    background: `${notifColor(n.type)}14`,
                    color: notifColor(n.type),
                  }}
                >
                  {notifIcon(n.type)}
                </span>
                <span className="notif-item-content">
                  <span className="notif-item-title">{notifTitle(n, t)}</span>
                  {n.body && <span className="notif-item-body">{n.body}</span>}
                  <span className="notif-item-time">
                    {timeAgo(n.created_at, t)}
                  </span>
                </span>
                {!n.read && <span className="notif-item-dot" />}
              </button>
            ))}
          </div>
        ))}
        {loading && <div className="notif-loading">{t("notif.loading")}</div>}
      </div>
    </div>
  );
}
