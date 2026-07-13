import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  MessageCircle,
  Flame,
  Heart,
  MapPin,
  CircleHelp,
  CircleCheckBig,
  Clock3,
  LockKeyhole,
} from "lucide-react";
import { useNotifFeed } from "../hooks/NotificationFeedContext";
import { useI18n } from "../hooks/I18nContext";
import { useSpaceCtx } from "../hooks/SpaceContext";
import { Button } from "../components/ui/Button";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import type { AppNotification } from "../types";

const VI_ACTIONS = [
  " đã thêm một kỷ niệm mới",
  " đã bày tỏ cảm xúc",
  " đã bình luận",
  " đã hoàn thành streak",
  " streak đã bị mất",
];

type Translate = ReturnType<typeof useI18n>["t"];

function extractActorName(title: string): string {
  for (const action of VI_ACTIONS) {
    if (title.includes(action)) return title.split(action)[0];
  }
  // Fallback: take everything before last " đã "
  const idx = title.lastIndexOf(" đã ");
  if (idx > 0) return title.substring(0, idx);
  return title;
}

function notifTitle(n: AppNotification, t: Translate): string {
  const name = extractActorName(n.title);
  switch (n.type) {
    case "new_pin":
      return `${name} ${t("notif.actionNewPin")}`;
    case "reaction":
      return `${name} ${t("notif.actionReaction")}`;
    case "comment":
      return `${name} ${t("notif.actionComment")}`;
    case "support_reply":
      return t("notif.supportReply");
    case "space_quota_warning":
      return t("notif.spaceQuotaWarning");
    case "space_quota_restricted":
      return t("notif.spaceQuotaRestricted");
    case "space_quota_restored":
      return t("notif.spaceQuotaRestored");
    default:
      return n.title;
  }
}

function notifBody(n: AppNotification, t: Translate): string | null {
  switch (n.type) {
    case "space_quota_warning":
      return t("notif.spaceQuotaWarningBody");
    case "space_quota_restricted":
      return t("notif.spaceQuotaRestrictedBody");
    case "space_quota_restored":
      return t("notif.spaceQuotaRestoredBody");
    default:
      return n.body;
  }
}

function timeAgo(dateStr: string, t: Translate): string {
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
    case "support_reply":
      return <CircleHelp size={18} />;
    case "space_quota_warning":
      return <Clock3 size={18} />;
    case "space_quota_restricted":
      return <LockKeyhole size={18} />;
    case "space_quota_restored":
      return <CircleCheckBig size={18} />;
    default:
      return <Bell size={18} />;
  }
}

function notifTone(type: AppNotification["type"]) {
  switch (type) {
    case "new_pin":
      return "memory";
    case "reaction":
      return "reaction";
    case "comment":
      return "comment";
    case "streak_reminder":
      return "streak-warning";
    case "streak_complete":
      return "streak-success";
    case "streak_broken":
      return "streak-danger";
    case "support_reply":
      return "support";
    case "space_quota_warning":
      return "quota-warning";
    case "space_quota_restricted":
      return "quota-danger";
    case "space_quota_restored":
      return "quota-success";
    default:
      return "neutral";
  }
}

type Section = { label: string; items: AppNotification[] };

function groupByTime(
  items: AppNotification[],
  t: Translate,
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
  const { spaces, activeSpace, setActiveSpace } = useSpaceCtx();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [openingId, setOpeningId] = useState<string | null>(null);
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

  async function handleNotifClick(n: AppNotification) {
    if (openingId) return;
    setOpeningId(n.id);
    try {
      if (!n.read) await markAsRead(n.id);

      const targetSpace = n.space_id
        ? spaces.find((space) => space.id === n.space_id)
        : null;
      if (targetSpace && targetSpace.id !== activeSpace?.id) {
        await setActiveSpace(targetSpace.id);
      }

      const pinId = n.data?.pin_id as string | undefined;
      if (pinId && ["new_pin", "reaction", "comment"].includes(n.type)) {
        navigate("/timeline", { state: { openPinId: pinId } });
      } else if (
        n.type === "streak_reminder" ||
        n.type === "streak_broken"
      ) {
        navigate("/wishlist");
      } else if (n.type === "support_reply") {
        navigate("/settings", { state: { openSupport: "contact" } });
      } else if (n.type.startsWith("space_quota_")) {
        navigate("/settings");
      }
    } finally {
      setOpeningId(null);
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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leadingIcon={<CheckCheck size={16} />}
            className="notif-mark-all-btn"
            onClick={markAllAsRead}
          >
            {t("notif.markRead")}
          </Button>
        )}
      </header>

      <SegmentedControl
        value={tab}
        onChange={setTab}
        label={t("nav.notifications")}
        size="sm"
        className="notif-filter"
        options={[
          { value: "all", label: t("notif.all") },
          { value: "unread", label: t("notif.unread") },
        ]}
      />

      {filtered.length === 0 && !loading && (
        <div className="empty-state notif-empty-state">
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
            {section.items.map((n) => {
              const title = notifTitle(n, t);
              const body = notifBody(n, t);
              const spaceName =
                n.space_name ??
                spaces.find((space) => space.id === n.space_id)?.name ??
                null;
              const relativeTime = timeAgo(n.created_at, t);
              const ariaLabel = [
                !n.read ? t("notif.unread") : undefined,
                title,
                body,
                relativeTime,
              ]
                .filter((part): part is string => Boolean(part))
                .join(". ");

              return (
                <button
                  key={n.id}
                  type="button"
                  disabled={openingId !== null}
                  aria-label={ariaLabel}
                  className={`notif-item ${n.read ? "" : "unread"}`}
                  onClick={() => void handleNotifClick(n)}
                >
                  <span
                    className={`notif-item-icon notif-item-icon-${notifTone(n.type)}`}
                  >
                    {notifIcon(n.type)}
                  </span>
                  <span className="notif-item-content">
                    <span className="notif-item-title">{title}</span>
                    {body && (
                      <span className="notif-item-body">{body}</span>
                    )}
                    {spaceName && (
                      <span className="notif-item-space">
                        <MapPin size={11} aria-hidden="true" />
                        {t("notif.inSpace", { name: spaceName })}
                      </span>
                    )}
                    <span className="notif-item-time">{relativeTime}</span>
                  </span>
                  {!n.read && <span className="notif-item-dot" />}
                </button>
              );
            })}
          </div>
        ))}
        {loading && <div className="notif-loading">{t("notif.loading")}</div>}
      </div>
    </div>
  );
}
