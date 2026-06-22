import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { List } from "react-window";
import {
  Calendar,
  Check,
  ChevronDown,
  MapPin,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { usePinsCtx } from "../hooks/PinsContext";
import { useCoupleCtx } from "../hooks/CoupleContext";
import { useI18n } from "../hooks/I18nContext";
import { useCategoriesCtx } from "../hooks/CategoriesContext";
import { useTimelinePins } from "../hooks/useTimelinePins";
import {
  getImageUrl,
  getVideoThumbnailUrl,
  isVideoUrl,
} from "../lib/cloudinary";
import {
  readTimelineViewMode,
  writeTimelineViewMode,
  type TimelineViewMode,
} from "../lib/timelineViewMode";
import { getPinCategoryIds } from "../lib/pinCategories";
import { BottomSheet } from "../components/ui/BottomSheet";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { PinDetail } from "../components/pins/PinDetail";
import { TimelineCircleView } from "../components/timeline/TimelineCircleView";
import type { Pin } from "../types";
import type { UploadingPinInfo } from "../hooks/PinsContext";

function monthKey(d: string, lang: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString(lang === "vi" ? "vi-VN" : undefined, {
    year: "numeric",
    month: "long",
  });
}

function useDebouncedValue(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

function formatFilterDate(value: string, lang: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return lang === "vi" ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

type TimelineRow =
  | { type: "month"; id: string; label: string }
  | { type: "pin"; id: string; pin: Pin }
  | { type: "footer"; id: string };

const TIMELINE_MONTH_ROW_HEIGHT = 48;
const TIMELINE_PIN_ROW_HEIGHT = 168;
const TIMELINE_FOOTER_ROW_HEIGHT = 118;

interface TimelineRowProps {
  rows: TimelineRow[];
  lang: string;
  profileId?: string;
  profileName: string;
  partnerName: string;
  favoritesLabel: string;
  loadingMore: boolean;
  loadingMoreLabel: string;
  uploadingPins: Map<string, UploadingPinInfo>;
  getCategory: ReturnType<typeof useCategoriesCtx>["getCategory"];
  openPinDetail: (pin: Pin) => void;
}

function TimelineRowItem({
  index,
  style,
  rows,
  lang,
  profileId,
  profileName,
  partnerName,
  favoritesLabel,
  loadingMore,
  loadingMoreLabel,
  uploadingPins,
  getCategory,
  openPinDetail,
}: TimelineRowProps & { index: number; style: CSSProperties }) {
  const row = rows[index];
  if (!row) return null;

  if (row.type === "month") {
    return (
      <div style={style} className="timeline-virtual-row month-row">
        <h3 className="month-label">{row.label}</h3>
      </div>
    );
  }

  if (row.type === "footer") {
    return (
      <div
        style={style}
        className="timeline-virtual-row footer-row"
        aria-hidden={!loadingMore}
      >
        {loadingMore && (
          <div className="timeline-loading-more">{loadingMoreLabel}</div>
        )}
      </div>
    );
  }

  const p = row.pin;
  const uploadInfo = uploadingPins.get(p.id);
  const cover = p.images?.[0]?.cloudinary_url;
  const coverThumb = cover
    ? isVideoUrl(cover)
      ? getVideoThumbnailUrl(cover, 248)
      : getImageUrl(cover, 248)
    : null;
  const cat = getCategory(p.category);
  const who = p.created_by === profileId ? profileName : partnerName;

  return (
    <div style={style} className="timeline-virtual-row pin-row">
      <div className={`timeline-card ${p.is_favorite ? "favorite" : ""}`}>
        <button
          type="button"
          className="timeline-card-open"
          onClick={() => openPinDetail(p)}
          aria-label={p.title}
        >
          <span className="timeline-media-frame" aria-hidden="true">
            {coverThumb ? (
              <img
                src={coverThumb}
                alt=""
                className="timeline-thumb"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span className="timeline-thumb empty">
                {uploadInfo ? (
                  <span className="timeline-upload-progress">
                    <span className="timeline-upload-spinner" />
                    <span className="timeline-upload-pct">
                      {uploadInfo.progress}%
                    </span>
                  </span>
                ) : (
                  (cat?.emoji ?? "📷")
                )}
              </span>
            )}
          </span>
          <span
            className={`timeline-content ${p.is_favorite ? "has-favorite-action" : ""}`}
          >
            <span className="timeline-title-row">
              <span className="timeline-title">{p.title}</span>
              {cat && (
                <span
                  className="category-badge sm"
                  style={{ background: `${cat.color}1a`, color: cat.color }}
                >
                  {cat.emoji} {cat.label}
                </span>
              )}
            </span>
            {p.note && <span className="timeline-note">{p.note}</span>}
            <span className="timeline-meta">
              <MapPin size={12} aria-hidden="true" /> {p.city ?? "—"} · {who} ·{" "}
              {new Date(p.created_at).toLocaleDateString(
                lang === "vi" ? "vi-VN" : undefined,
              )}
            </span>
            {uploadInfo && (
              <span className="timeline-upload-bar">
                <span
                  className="timeline-upload-bar-fill"
                  style={
                    {
                      "--timeline-upload-progress": uploadInfo.progress / 100,
                    } as CSSProperties
                  }
                />
              </span>
            )}
          </span>
        </button>
        {p.is_favorite && (
          <span className="timeline-favorite-toggle" aria-hidden="true">
            <Star size={12} fill="currentColor" /> {favoritesLabel}
          </span>
        )}
      </div>
    </div>
  );
}

interface TimelinePageContentProps {
  deepLinkPinId?: string;
}

export function TimelinePage() {
  return <TimelinePageContent />;
}

export function TimelinePageContent({ deepLinkPinId }: TimelinePageContentProps) {
  const {
    pins: livePins,
    deletePin,
    uploadingPins,
    pinsVersion,
    loadPinById,
  } = usePinsCtx();
  const { couple, profile, partner } = useCoupleCtx();
  const { t, lang } = useI18n();
  const { allCategories, getCategory } = useCategoriesCtx();
  const navigate = useNavigate();
  const location = useLocation();

  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [includeFavorites, setIncludeFavorites] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [creatorFilter, setCreatorFilter] = useState<string>("all");
  const [addressFilter, setAddressFilter] = useState("");
  const [draftCategoryFilters, setDraftCategoryFilters] = useState<string[]>(
    [],
  );
  const [draftIncludeFavorites, setDraftIncludeFavorites] = useState(false);
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");
  const [draftCreatorFilter, setDraftCreatorFilter] = useState<string>("all");
  const [draftAddressFilter, setDraftAddressFilter] = useState("");
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<TimelineViewMode>(() =>
    readTimelineViewMode(),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creatorMenuOpen, setCreatorMenuOpen] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const deepLinkRequestRef = useRef<{
    pinId: string;
    status: "loading" | "settled";
  } | null>(null);
  const langRef = useRef(lang);
  const debouncedAddressFilter = useDebouncedValue(addressFilter);

  const timelineFilters = useMemo(
    () => ({
      categoryIds: categoryFilters,
      includeFavorites,
      dateFrom,
      dateTo,
      creatorId: creatorFilter,
      address: debouncedAddressFilter,
    }),
    [
      categoryFilters,
      creatorFilter,
      dateFrom,
      dateTo,
      debouncedAddressFilter,
      includeFavorites,
    ],
  );

  const {
    pins: timelinePins,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  } = useTimelinePins(couple?.id, timelineFilters, pinsVersion);

  const circleResetKey = useMemo(
    () =>
      JSON.stringify({
        filters: timelineFilters,
        firstPinId: timelinePins[0]?.id ?? null,
      }),
    [timelineFilters, timelinePins],
  );

  const favoriteCount = livePins.filter((p) => p.is_favorite).length;

  const usedCategories = useMemo(() => {
    const ids = new Set<string>();
    livePins.forEach((pin) => {
      getPinCategoryIds(pin).forEach((categoryId) => ids.add(categoryId));
    });
    return allCategories.filter((c) => ids.has(c.id));
  }, [allCategories, livePins]);

  const rows = useMemo(() => {
    const groups: Record<string, Pin[]> = {};
    timelinePins.forEach((p) => {
      const k = monthKey(p.created_at, lang);
      const arr = groups[k] ?? (groups[k] = []);
      arr.push(p);
    });
    const groupedRows = Object.entries(groups).flatMap<TimelineRow>(
      ([month, items]) => [
        { type: "month", id: `month-${month}`, label: month },
        ...items.map((pin) => ({ type: "pin" as const, id: pin.id, pin })),
      ],
    );
    return groupedRows.length > 0
      ? [...groupedRows, { type: "footer" as const, id: "timeline-footer" }]
      : groupedRows;
  }, [timelinePins, lang]);

  const getTimelineRowHeight = useCallback(
    (index: number, props: TimelineRowProps) => {
      const row = props.rows[index];
      if (row?.type === "month") return TIMELINE_MONTH_ROW_HEIGHT;
      if (row?.type === "footer") return TIMELINE_FOOTER_ROW_HEIGHT;
      return TIMELINE_PIN_ROW_HEIGHT;
    },
    [],
  );

  function flyToPin(p: Pin) {
    setSelectedPin(null);
    setDeepLinkError(null);
    navigate("/", {
      state: {
        flyTo: {
          lat: p.lat,
          lng: p.lng,
          pinId: p.id,
          openDetail: false,
        },
      },
    });
  }

  function openPinDetail(p: Pin) {
    setSelectedPin(p);
  }

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    if (!deepLinkPinId) {
      deepLinkRequestRef.current = null;
      return;
    }

    const existing =
      livePins.find((p) => p.id === deepLinkPinId) ??
      timelinePins.find((p) => p.id === deepLinkPinId);
    if (!existing) return;

    deepLinkRequestRef.current = { pinId: deepLinkPinId, status: "settled" };
    const frame = window.requestAnimationFrame(() => {
      setSelectedPin(existing);
      setDeepLinkLoading(false);
      setDeepLinkError(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [deepLinkPinId, livePins, timelinePins]);

  useEffect(() => {
    if (!deepLinkPinId) {
      deepLinkRequestRef.current = null;
      return;
    }

    if (deepLinkRequestRef.current?.pinId === deepLinkPinId) return;

    let cancelled = false;
    const frames = new Set<number>();
    const scheduleState = (apply: () => void) => {
      const frame = window.requestAnimationFrame(() => {
        frames.delete(frame);
        if (!cancelled) apply();
      });
      frames.add(frame);
    };

    deepLinkRequestRef.current = { pinId: deepLinkPinId, status: "loading" };

    scheduleState(() => {
      setSelectedPin(null);
      setDeepLinkLoading(true);
      setDeepLinkError(null);
    });

    loadPinById(deepLinkPinId)
      .then((pin) => {
        if (cancelled) return;
        deepLinkRequestRef.current = {
          pinId: deepLinkPinId,
          status: "settled",
        };
        scheduleState(() => {
          if (pin) {
            setSelectedPin(pin);
            setDeepLinkError(null);
          } else {
            setDeepLinkError(
              langRef.current === "vi"
                ? "Không tìm thấy kỷ niệm này."
                : "This memory could not be found.",
            );
          }
        });
      })
      .catch((error) => {
        if (cancelled) return;
        deepLinkRequestRef.current = {
          pinId: deepLinkPinId,
          status: "settled",
        };
        scheduleState(() => {
          setDeepLinkError(
            error instanceof Error ? error.message : String(error),
          );
        });
      })
      .finally(() => {
        if (!cancelled) {
          scheduleState(() => setDeepLinkLoading(false));
        }
      });

    return () => {
      cancelled = true;
      frames.forEach((frame) => window.cancelAnimationFrame(frame));
      frames.clear();
    };
  }, [deepLinkPinId, loadPinById]);

  function closePinDetail() {
    setSelectedPin(null);
    setDeepLinkError(null);
    if (deepLinkPinId) {
      navigate("/timeline", { replace: true });
    }
  }

  function handleViewModeChange(mode: TimelineViewMode) {
    setViewMode(mode);
    writeTimelineViewMode(mode);
  }

  // Open pin from notification navigation
  useEffect(() => {
    const state = location.state as { openPinId?: string } | null;
    if (!state?.openPinId) return;
    const pin =
      livePins.find((p) => p.id === state.openPinId) ??
      timelinePins.find((p) => p.id === state.openPinId);
    if (!pin) return;

    const frame = window.requestAnimationFrame(() => {
      setSelectedPin(pin);
      // Clear the state so it doesn't re-open on re-render
      navigate(location.pathname, { replace: true, state: {} });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.state, livePins, timelinePins, navigate, location.pathname]);

  function clearAdvancedFilters() {
    setCategoryFilters([]);
    setIncludeFavorites(false);
    setDateFrom("");
    setDateTo("");
    setCreatorFilter("all");
    setAddressFilter("");
    setDraftCategoryFilters([]);
    setDraftIncludeFavorites(false);
    setDraftDateFrom("");
    setDraftDateTo("");
    setDraftCreatorFilter("all");
    setDraftAddressFilter("");
  }

  function toggleDraftCategory(categoryId: string) {
    setDraftCategoryFilters((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  }

  function syncDraftFilters() {
    setDraftCategoryFilters(categoryFilters);
    setDraftIncludeFavorites(includeFavorites);
    setDraftDateFrom(dateFrom);
    setDraftDateTo(dateTo);
    setDraftCreatorFilter(creatorFilter);
    setDraftAddressFilter(addressFilter);
  }

  function applyDraftFilters() {
    setCategoryFilters(draftCategoryFilters);
    setIncludeFavorites(draftIncludeFavorites);
    setDateFrom(draftDateFrom);
    setDateTo(draftDateTo);
    setCreatorFilter(draftCreatorFilter);
    setAddressFilter(draftAddressFilter);
    setFiltersOpen(false);
    setCreatorMenuOpen(false);
  }

  const creatorOptions = useMemo(
    () => [
      { value: "all", label: t("timeline.creatorAll") },
      ...(profile
        ? [
            {
              value: profile.id,
              label: profile.display_name ?? t("common.you"),
            },
          ]
        : []),
      ...(partner
        ? [
            {
              value: partner.id,
              label: partner.display_name ?? t("common.partner"),
            },
          ]
        : []),
    ],
    [partner, profile, t],
  );
  const selectedCreatorLabel =
    creatorOptions.find((option) => option.value === draftCreatorFilter)
      ?.label ?? t("timeline.creatorAll");

  const hasAdvancedFilters =
    categoryFilters.length > 0 ||
    includeFavorites ||
    !!dateFrom ||
    !!dateTo ||
    creatorFilter !== "all" ||
    !!addressFilter.trim();
  const activeFilterCount =
    categoryFilters.length +
    (includeFavorites ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (creatorFilter !== "all" ? 1 : 0) +
    (addressFilter.trim() ? 1 : 0);

  const handleRowsRendered = useCallback(
    (
      _visibleRows: { startIndex: number; stopIndex: number },
      allRows: { startIndex: number; stopIndex: number },
    ) => {
      if (!hasMore || loading || loadingMore) return;
      if (allRows.stopIndex >= rows.length - 4) loadMore();
    },
    [hasMore, loadMore, loading, loadingMore, rows.length],
  );

  useEffect(() => {
    if (!filtersOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ".timeline-filter-toggle, .timeline-filter-reset, .timeline-filter-panel",
        )
      ) {
        return;
      }
      setFiltersOpen(false);
      setCreatorMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        setCreatorMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [filtersOpen]);

  if (!deepLinkPinId && !loading && total === 0 && !hasAdvancedFilters) {
    return (
      <div className="page page-timeline timeline-page-empty empty-state">
        <div className="empty-emoji">📍</div>
        <h2>{t("timeline.empty")}</h2>
        <p className="muted">{t("timeline.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div
      className={[
        "page",
        "page-timeline",
        viewMode === "circle" ? "timeline-circle-mode" : "",
        filtersOpen ? "timeline-filters-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="page-header">
        <h1>{t("timeline.title")}</h1>
        <p className="muted">
          {total} {t("timeline.memoriesShared")}
        </p>
      </header>

      <div className="timeline-filter-popover" ref={filterPopoverRef}>
        <div className="timeline-filter-summary">
          <button
            type="button"
            className={`timeline-filter-toggle ${filtersOpen ? "active" : ""}`}
            onClick={() => {
              setFiltersOpen((open) => {
                if (!open) syncDraftFilters();
                return !open;
              });
            }}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal size={16} />
            <span>{lang === "vi" ? "Bộ lọc" : "Filters"}</span>
            {activeFilterCount > 0 && (
              <span className="timeline-filter-count">{activeFilterCount}</span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="timeline-filter-reset"
              onClick={() => {
                clearAdvancedFilters();
              }}
            >
              <X size={14} /> {t("timeline.clearFilters")}
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="timeline-filter-panel">
            {(usedCategories.length > 0 || favoriteCount > 0) && (
              <div className="filter-row">
                <button
                  type="button"
                  className={`filter-chip ${draftCategoryFilters.length === 0 && !draftIncludeFavorites ? "active" : ""}`}
                  onClick={() => {
                    setDraftCategoryFilters([]);
                    setDraftIncludeFavorites(false);
                  }}
                >
                  {lang === "vi" ? "Tất cả" : "All"} ({livePins.length})
                </button>
                {favoriteCount > 0 && (
                  <button
                    type="button"
                    className={`filter-chip favorite-filter ${draftIncludeFavorites ? "active" : ""}`}
                    onClick={() => setDraftIncludeFavorites((value) => !value)}
                  >
                    <Star size={14} fill="currentColor" />
                    <span>{t("timeline.favorites")}</span>
                    <span className="filter-count">{favoriteCount}</span>
                  </button>
                )}
                {usedCategories.map((c) => {
                  const count = livePins.filter((pin) =>
                    getPinCategoryIds(pin).some(
                      (categoryId) => categoryId === c.id,
                    ),
                  ).length;
                  const active = draftCategoryFilters.includes(c.id);
                  return (
                    <button
                      type="button"
                      key={c.id}
                      className={`filter-chip category-filter ${active ? "active" : ""}`}
                      style={
                        active
                          ? ({
                              "--tag-active-bg": c.color,
                            } as React.CSSProperties)
                          : undefined
                      }
                      onClick={() => toggleDraftCategory(c.id)}
                    >
                      <span className="emoji">{c.emoji}</span>
                      <span>{c.label}</span>
                      <span className="filter-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="timeline-advanced-filters">
              <div className="timeline-filter-field">
                <label>{t("timeline.fromDate")}</label>
                <div
                  className={`timeline-date-input ${draftDateFrom ? "filled" : "empty"}`}
                >
                  <span className="timeline-date-display">
                    {draftDateFrom
                      ? formatFilterDate(draftDateFrom, lang)
                      : "dd/mm/yyyy"}
                  </span>
                  <Calendar size={16} aria-hidden="true" />
                  <input
                    type="date"
                    value={draftDateFrom}
                    onChange={(e) => setDraftDateFrom(e.target.value)}
                    aria-label={t("timeline.fromDate")}
                  />
                </div>
              </div>
              <div className="timeline-filter-field">
                <label>{t("timeline.toDate")}</label>
                <div
                  className={`timeline-date-input ${draftDateTo ? "filled" : "empty"}`}
                >
                  <span className="timeline-date-display">
                    {draftDateTo
                      ? formatFilterDate(draftDateTo, lang)
                      : "dd/mm/yyyy"}
                  </span>
                  <Calendar size={16} aria-hidden="true" />
                  <input
                    type="date"
                    value={draftDateTo}
                    onChange={(e) => setDraftDateTo(e.target.value)}
                    aria-label={t("timeline.toDate")}
                  />
                </div>
              </div>
              <div className="timeline-filter-field">
                <label>{t("timeline.creator")}</label>
                <div className="timeline-creator-select">
                  <button
                    type="button"
                    className="timeline-creator-trigger"
                    onClick={() => setCreatorMenuOpen((open) => !open)}
                    aria-haspopup="listbox"
                    aria-expanded={creatorMenuOpen}
                  >
                    <span>{selectedCreatorLabel}</span>
                    <ChevronDown size={16} />
                  </button>
                  {creatorMenuOpen && (
                    <div className="timeline-creator-menu" role="listbox">
                      {creatorOptions.map((option) => {
                        const active = option.value === draftCreatorFilter;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={`timeline-creator-option ${active ? "active" : ""}`}
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setDraftCreatorFilter(option.value);
                              setCreatorMenuOpen(false);
                            }}
                          >
                            <span>{option.label}</span>
                            {active && <Check size={14} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="timeline-filter-field address">
                <label>{t("timeline.address")}</label>
                <div className="timeline-address-filter">
                  <Search size={14} />
                  <input
                    type="search"
                    value={draftAddressFilter}
                    onChange={(e) => setDraftAddressFilter(e.target.value)}
                    placeholder={t("timeline.addressPlaceholder")}
                  />
                </div>
              </div>
            </div>
            <div className="timeline-filter-actions">
              <button
                type="button"
                className="timeline-filter-search-btn"
                onClick={applyDraftFilters}
              >
                <Search size={15} />
                <span>{lang === "vi" ? "Tìm kiếm" : "Search"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="timeline-view-switch">
        <SegmentedControl<TimelineViewMode>
          label={t("timeline.viewMode")}
          value={viewMode}
          onChange={handleViewModeChange}
          options={[
            { value: "list", label: t("timeline.viewList") },
            { value: "circle", label: t("timeline.viewCircle") },
          ]}
        />
      </div>

      {error && (
        <div className="timeline-empty-filter">
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="timeline-empty-filter">
          <p>{lang === "vi" ? "Đang tải kỷ niệm..." : "Loading memories..."}</p>
        </div>
      )}

      {!loading && timelinePins.length === 0 && (
        <div className="timeline-empty-filter">
          <p>{t("timeline.noResults")}</p>
        </div>
      )}

      {!loading && timelinePins.length > 0 && viewMode === "circle" && (
        <TimelineCircleView
          pins={timelinePins}
          hasMore={hasMore}
          loading={loading}
          loadingMore={loadingMore}
          loadMore={loadMore}
          lang={lang}
          labels={{
            ariaLabel: t("timeline.circleAriaLabel"),
            newest: t("timeline.circleNewest"),
            dragHint: t("timeline.circleDragHint"),
            zoomHint: t("timeline.circleZoomHint"),
            loadMore: t("timeline.circleLoadMore"),
            loadingMore: t("timeline.loadingMore"),
          }}
          resetKey={circleResetKey}
          getCategory={getCategory}
          openPinDetail={openPinDetail}
        />
      )}

      {!loading && rows.length > 0 && viewMode === "list" && (
        <List<TimelineRowProps>
          className="timeline-virtual-list"
          rowComponent={TimelineRowItem}
          rowCount={rows.length}
          rowHeight={getTimelineRowHeight}
          rowProps={{
            rows,
            lang,
            profileId: profile?.id,
            profileName: profile?.display_name ?? t("common.you"),
            partnerName: partner?.display_name ?? t("common.partner"),
            favoritesLabel: t("timeline.favorites"),
            loadingMore,
            loadingMoreLabel: t("timeline.loadingMore"),
            uploadingPins,
            getCategory,
            openPinDetail,
          }}
          overscanCount={6}
          onRowsRendered={handleRowsRendered}
          defaultHeight={620}
          style={{ width: "100%" }}
        />
      )}
      <BottomSheet
        open={!!selectedPin || deepLinkLoading || !!deepLinkError}
        onClose={closePinDetail}
        title={t("pin.memory")}
      >
        {selectedPin ? (
          <PinDetail
            pin={
              timelinePins.find((p) => p.id === selectedPin.id) ??
              livePins.find((p) => p.id === selectedPin.id) ??
              selectedPin
            }
            currentUserId={profile?.id}
            currentUserName={profile?.display_name ?? null}
            onShowOnMap={flyToPin}
            onDelete={async (id) => {
              await deletePin(id);
              closePinDetail();
              refresh();
            }}
            onUpdated={() => {
              refresh();
              closePinDetail();
            }}
            onFavoriteUpdated={(updated) => {
              setSelectedPin(updated);
              refresh();
            }}
          />
        ) : (
          <div className="pin-detail-deeplink-state" role="status">
            <p>
              {deepLinkError ??
                (lang === "vi" ? "Đang mở kỷ niệm..." : "Opening memory...")}
            </p>
            {deepLinkError && (
              <button
                type="button"
                className="timeline-filter-search-btn"
                onClick={() => navigate("/timeline", { replace: true })}
              >
                {lang === "vi" ? "Về Timeline" : "Back to Timeline"}
              </button>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
