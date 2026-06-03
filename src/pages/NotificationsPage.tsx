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

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
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

function groupByTime(items: AppNotification[]): Section[] {
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
    const t = new Date(n.created_at).getTime();
    if (t >= startOfToday && !n.read) {
      newItems.push(n);
    } else if (t >= startOfToday) {
      todayItems.push(n);
    } else if (t >= startOfYesterday) {
      todayItems.push(n);
    } else {
      earlierItems.push(n);
    }
  }

  const sections: Section[] = [];
  if (newItems.length) sections.push({ label: "Mới", items: newItems });
  if (todayItems.length) sections.push({ label: "Hôm nay", items: todayItems });
  if (earlierItems.length)
    sections.push({ label: "Trước đó", items: earlierItems });
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

  const sections = useMemo(() => groupByTime(filtered), [filtered]);

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
            <span>Đánh dấu đã đọc</span>
          </button>
        )}
      </header>

      <div className="notif-tabs">
        <button
          type="button"
          className={`notif-tab ${tab === "all" ? "active" : ""}`}
          onClick={() => setTab("all")}
        >
          Tất cả
        </button>
        <button
          type="button"
          className={`notif-tab ${tab === "unread" ? "active" : ""}`}
          onClick={() => setTab("unread")}
        >
          Chưa đọc
        </button>
      </div>

      {filtered.length === 0 && !loading && (
        <div className="empty-state">
          <Bell size={40} strokeWidth={1.5} className="muted" />
          <p className="muted">
            {tab === "unread"
              ? "Không có thông báo chưa đọc"
              : "Chưa có thông báo nào"}
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
                  <span className="notif-item-title">{n.title}</span>
                  {n.body && <span className="notif-item-body">{n.body}</span>}
                  <span className="notif-item-time">
                    {timeAgo(n.created_at)}
                  </span>
                </span>
                {!n.read && <span className="notif-item-dot" />}
              </button>
            ))}
          </div>
        ))}
        {loading && <div className="notif-loading">Đang tải...</div>}
      </div>
    </div>
  );
}
