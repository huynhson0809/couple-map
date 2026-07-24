import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bell,
  CheckCheck,
  MessageCircle,
  Flame,
  Heart,
  MapPin,
  X,
} from "lucide-react";
import { useNotificationFeed } from "../../hooks/useNotificationFeed";
import { useCoupleCtx } from "../../hooks/CoupleContext";
import { useSpaceCtx } from "../../hooks/SpaceContext";
import { useI18n } from "../../hooks/I18nContext";
import { localizedNotificationCopy } from "../../lib/notificationCopy";
import { formatRelativeTime } from "../../lib/relativeTime";
import type { AppNotification } from "../../types";

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
      return "var(--coral, #ff676d)";
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
      return "var(--fg)";
  }
}

export function TopBar() {
  const { t, lang } = useI18n();
  const { profile } = useCoupleCtx();
  const { activeSpace } = useSpaceCtx();
  const {
    notifications,
    unreadCount,
    loading,
    hasMore,
    fetchMore,
    markAsRead,
    markAllAsRead,
  } = useNotificationFeed(profile?.id, activeSpace?.id);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleScroll = useCallback(() => {
    if (!listRef.current || loading || !hasMore) return;
    const el = listRef.current;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchMore();
    }
  }, [loading, hasMore, fetchMore]);

  return (
    <header className="top-bar">
      <div className="top-bar-brand">
        <img src="/icons/icon-192.png" alt="" className="top-bar-logo" />
        <span className="top-bar-name">Pinly</span>
      </div>

      <div className="top-bar-actions" ref={panelRef}>
        <button
          type="button"
          className="notif-bell-btn"
          onClick={() => setOpen(!open)}
          aria-label={t("notifications.title")}
          aria-expanded={open}
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="notif-bell-badge">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="notif-panel">
            <div className="notif-panel-header">
              <h3>{t("notifications.title")}</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notif-mark-all"
                  onClick={markAllAsRead}
                  title={t("notifications.markAllRead")}
                  aria-label={t("notifications.markAllRead")}
                >
                  <CheckCheck size={16} />
                </button>
              )}
              <button
                type="button"
                className="notif-panel-close"
                onClick={() => setOpen(false)}
                aria-label={t("common.close")}
              >
                <X size={18} />
              </button>
            </div>

            <div
              className="notif-panel-list"
              ref={listRef}
              onScroll={handleScroll}
            >
              {notifications.length === 0 && !loading && (
                <div className="notif-empty">
                  <Bell size={32} strokeWidth={1.5} />
                  <p>{t("notifications.empty")}</p>
                </div>
              )}
              {notifications.map((n) => {
                const { title, body } = localizedNotificationCopy(n, t);
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`notif-item ${n.read ? "" : "unread"}`}
                    onClick={() => {
                      if (!n.read) void markAsRead(n.id);
                    }}
                  >
                    <span
                      className="notif-item-icon"
                      style={{ color: notifColor(n.type) }}
                    >
                      {notifIcon(n.type)}
                    </span>
                    <span className="notif-item-content">
                      <span className="notif-item-title">{title}</span>
                      {body && <span className="notif-item-body">{body}</span>}
                      <span className="notif-item-time">
                        {formatRelativeTime(n.created_at, lang)}
                      </span>
                    </span>
                    {!n.read && <span className="notif-item-dot" />}
                  </button>
                );
              })}
              {loading && (
                <div className="notif-loading">{t("notifications.loading")}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
