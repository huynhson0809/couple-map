import { useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Globe2, Sparkles, CalendarHeart, Plane, X } from "lucide-react";
import { useCoupleCtx } from "../hooks/CoupleContext";
import { useSpaceCtx } from "../hooks/SpaceContext";
import { usePinsCtx } from "../hooks/PinsContext";
import { useStats } from "../hooks/useStats";
import { useI18n } from "../hooks/I18nContext";

type DetailType = "cities" | "countries" | "memories" | "farthest" | null;

export function StatsPage() {
  const { couple, partner, profile } = useCoupleCtx();
  const { capabilities } = useSpaceCtx();
  const duoEnabled = capabilities.canUseDuoFeatures;
  const { pins } = usePinsCtx();
  const { t } = useI18n();
  const s = useStats(pins, couple);
  const [detail, setDetail] = useState<DetailType>(null);

  function getDetailContent() {
    switch (detail) {
      case "cities":
        return {
          title: t("stats.cities"),
          items: s.cityList,
        };
      case "countries":
        return {
          title: t("stats.countries"),
          items: s.countryList,
        };
      case "memories":
        return {
          title: t("stats.memories"),
          items: pins.map(
            (p) => p.title || p.city || `${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`,
          ),
        };
      case "farthest":
        return {
          title: t("stats.farthest"),
          items: s.farthestPair
            ? [
                s.farthestPair[0].title || s.farthestPair[0].city || "Pin 1",
                s.farthestPair[1].title || s.farthestPair[1].city || "Pin 2",
                `${s.farthestKm} km`,
              ]
            : [],
        };
      default:
        return null;
    }
  }

  const detailContent = getDetailContent();

  return (
    <div className="page page-stats">
      <header className="page-header">
        <h1>{t("stats.title")}</h1>
        <p className="muted">
          {profile?.display_name ?? t("common.you")} &{" "}
          {partner?.display_name ?? t("common.them")}
        </p>
      </header>

      <div className="stat-grid">
        <StatCard
          icon={<Sparkles />}
          value={s.totalPins}
          label={t("stats.memories")}
          color="#ff5a5f"
          onClick={() => setDetail("memories")}
        />
        <StatCard
          icon={<MapPin />}
          value={s.cities}
          label={t("stats.cities")}
          color="#378add"
          onClick={() => setDetail("cities")}
        />
        <StatCard
          icon={<Globe2 />}
          value={s.countries}
          label={t("stats.countries")}
          color="#9333ea"
          onClick={() => setDetail("countries")}
        />
        {duoEnabled && (
          <StatCard
            icon={<CalendarHeart />}
            value={s.daysTogether ?? "—"}
            label={t("stats.daysTogether")}
            color="#ff4d57"
          />
        )}
        <StatCard
          icon={<Plane />}
          value={`${s.farthestKm} km`}
          label={t("stats.farthest")}
          color="#f59e0b"
          onClick={() => setDetail("farthest")}
        />
      </div>

      {s.cityList.length > 0 && (
        <section className="stat-section">
          <h3>{t("stats.placesBeen")}</h3>
          <div className="chip-row">
            {s.cityList.map((c) => (
              <span key={c} className="chip">
                {c}
              </span>
            ))}
          </div>
        </section>
      )}

      {detail && detailContent && createPortal(
        <div className="stat-detail-overlay" onClick={() => setDetail(null)}>
          <div
            className="stat-detail-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="stat-detail-header">
              <h3>{detailContent.title}</h3>
              <button
                type="button"
                className="stat-detail-close"
                onClick={() => setDetail(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="stat-detail-list">
              {detailContent.items.length === 0 && (
                <p className="muted">Chưa có dữ liệu</p>
              )}
              {detailContent.items.map((item, i) => (
                <div key={i} className="stat-detail-item">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`stat-card ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="stat-icon" style={{ background: `${color}1a`, color }}>
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
