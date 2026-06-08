import { Bell, CheckCircle2, Flame, Link2 } from "lucide-react";
import type { CSSProperties } from "react";
import { useI18n } from "../../hooks/I18nContext";
import type { User } from "../../types";

function initial(name: string | null | undefined, fallback: string) {
  return (name?.trim()?.[0] || fallback).toUpperCase();
}

function weekIndexFromIso(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const sundayFirst = date.getUTCDay();
  return (sundayFirst + 6) % 7;
}

function weekStartFromIso(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - weekIndexFromIso(isoDate));
  return date.toISOString().slice(0, 10);
}

function isSameWeek(a: string, b: string) {
  return weekStartFromIso(a) === weekStartFromIso(b);
}

interface StreakCardProps {
  currentCount: number;
  bestCount: number;
  todayDate: string;
  lastCompletedDate: string | null;
  todayCompleted: boolean;
  youPosted: boolean;
  partnerPosted: boolean;
  atRisk: boolean;
  loading?: boolean;
  profile: User | null;
  partner: User | null;
  canNudge?: boolean;
  nudgeSending?: boolean;
  nudgeSent?: boolean;
  onNudge?: () => void;
}

export function StreakCard({
  currentCount,
  bestCount,
  todayDate,
  lastCompletedDate,
  todayCompleted,
  youPosted,
  partnerPosted,
  atRisk,
  loading,
  profile,
  partner,
  canNudge,
  nudgeSending,
  nudgeSent,
  onNudge,
}: StreakCardProps) {
  const { t, lang } = useI18n();
  const weekLabels =
    lang === "vi"
      ? ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
      : ["M", "T", "W", "T", "F", "S", "S"];
  const todayIndex = weekIndexFromIso(todayDate);
  const lastCompletedIndex =
    lastCompletedDate && isSameWeek(todayDate, lastCompletedDate)
      ? weekIndexFromIso(lastCompletedDate)
      : -1;

  // Determine how far back the streak fills this week
  const streakStartIndex = todayCompleted
    ? Math.max(0, todayIndex - currentCount + 1)
    : lastCompletedIndex >= 0
      ? Math.max(0, lastCompletedIndex - currentCount + 1)
      : -1;
  const activeIndex = todayCompleted ? todayIndex : lastCompletedIndex;
  const markerIndex = activeIndex >= 0 ? activeIndex : todayIndex;
  const markerPercent = `${(markerIndex / 6) * 100}%`;
  // Fill only from the streak start within this week, not from Monday
  const progressStart = streakStartIndex >= 0 ? streakStartIndex : markerIndex;
  const progressPercent =
    activeIndex >= 0 ? `${(activeIndex / 6) * 100}%` : "0%";
  const progressStartPercent = `${(progressStart / 6) * 100}%`;
  const weekRailStyle = {
    "--streak-week-progress": progressPercent,
    "--streak-week-progress-start": progressStartPercent,
    "--streak-week-today": markerPercent,
  } as CSSProperties;
  const pendingToday = !loading && !todayCompleted && currentCount > 0;
  const statusTone = loading
    ? "loading"
    : todayCompleted
      ? "complete"
      : atRisk
        ? "risk"
        : youPosted || partnerPosted
          ? "partial"
          : "idle";
  const youLabel = t("common.you");
  const partnerLabel = partner?.display_name ?? t("common.partner");
  const postedLabel = lang === "vi" ? "Đã lưu" : "Posted";
  const waitingLabel = lang === "vi" ? "Đang chờ" : "Waiting";

  const status = loading
    ? t("streak.loading")
    : todayCompleted
      ? t("streak.completed")
      : youPosted && !partnerPosted
        ? t("streak.partnerMissing")
        : !youPosted && partnerPosted
          ? t("streak.youMissing")
          : currentCount > 0
            ? t("streak.bothMissing")
            : t("streak.startToday");

  return (
    <section className={`streak-card ${statusTone}`}>
      <div className="streak-card-shine" aria-hidden="true" />
      <div className="streak-copy">
        <div className="streak-kicker">
          <Flame size={15} fill="currentColor" />
          <span>{t("streak.title")}</span>
        </div>
        <div className="streak-count">
          <strong>{currentCount}</strong>
          <span>{t("streak.days")}</span>
        </div>
        <p>{status}</p>
        {pendingToday && (
          <span className="streak-pending">{t("streak.pendingToday")}</span>
        )}
      </div>

      <div className="streak-chain" aria-label={status}>
        <div className={`streak-person ${youPosted ? "posted" : ""}`}>
          <span>{initial(profile?.display_name, "Y")}</span>
          <small>{youLabel}</small>
        </div>
        <div
          className={`streak-link ${todayCompleted ? "complete" : youPosted || partnerPosted ? "half" : ""}`}
        >
          {todayCompleted ? <CheckCircle2 size={20} /> : <Link2 size={20} />}
        </div>
        <div className={`streak-person ${partnerPosted ? "posted" : ""}`}>
          <span>{initial(partner?.display_name, "P")}</span>
          <small title={partnerLabel}>{partnerLabel}</small>
        </div>
      </div>

      <div className="streak-status-row">
        <span
          className={`streak-status-pill ${youPosted ? "posted" : "waiting"}`}
        >
          <span className="streak-status-dot">
            {initial(profile?.display_name, "Y")}
          </span>
          <span>
            <strong>{youLabel}</strong>
            {youPosted ? postedLabel : waitingLabel}
          </span>
        </span>
        <span
          className={`streak-status-pill ${partnerPosted ? "posted" : "waiting"}`}
        >
          <span className="streak-status-dot">
            {initial(partnerLabel, "P")}
          </span>
          <span>
            <strong>{partnerLabel}</strong>
            {partnerPosted ? postedLabel : waitingLabel}
          </span>
        </span>
      </div>

      <div className="streak-week" style={weekRailStyle}>
        <div className="streak-week-days" aria-hidden="true">
          {weekLabels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className={`${index === todayIndex && todayCompleted ? "today" : ""} ${index <= activeIndex ? "active" : ""}`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="streak-week-track" aria-hidden="true">
          <span className="streak-week-fill" />
          <span
            className={`streak-week-marker ${todayCompleted ? "complete" : "waiting"}`}
          >
            {todayCompleted && <CheckCircle2 size={15} />}
          </span>
        </div>
      </div>

      <p className="streak-howto">{t("streak.howTo")}</p>

      <div className="streak-footer">
        <div className="streak-best">
          {t("streak.best")} <strong>{bestCount}</strong>
        </div>
        {onNudge && !todayCompleted && youPosted && !partnerPosted && (
          <button
            type="button"
            className={`streak-nudge-btn ${nudgeSent ? "sent" : ""}`}
            disabled={!canNudge || nudgeSending}
            onClick={onNudge}
            title={t("streak.nudgeHint")}
          >
            <Bell size={14} />
            <span>
              {nudgeSending
                ? t("streak.nudgeSending")
                : nudgeSent
                  ? t("streak.nudgeSent")
                  : t("streak.nudge")}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
