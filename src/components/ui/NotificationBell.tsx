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
import type { AppNotification } from "../../types";

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
          aria-label="Thông báo"
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
              <h3>Thông báo</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notif-mark-all"
                  onClick={markAllAsRead}
                  title="Đánh dấu tất cả đã đọc"
                >
                  <CheckCheck size={16} />
                </button>
              )}
              <button
                type="button"
                className="notif-panel-close"
                onClick={() => setOpen(false)}
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
                  <p>Chưa có thông báo nào</p>
                </div>
              )}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notif-item ${n.read ? "" : "unread"}`}
                  onClick={() => {
                    if (!n.read) markAsRead(n.id);
                  }}
                >
                  <span
                    className="notif-item-icon"
                    style={{ color: notifColor(n.type) }}
                  >
                    {notifIcon(n.type)}
                  </span>
                  <span className="notif-item-content">
                    <span className="notif-item-title">{n.title}</span>
                    {n.body && (
                      <span className="notif-item-body">{n.body}</span>
                    )}
                    <span className="notif-item-time">
                      {timeAgo(n.created_at)}
                    </span>
                  </span>
                  {!n.read && <span className="notif-item-dot" />}
                </button>
              ))}
              {loading && <div className="notif-loading">Đang tải...</div>}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
