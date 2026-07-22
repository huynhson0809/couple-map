import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  EyeOff,
  Image as ImageIcon,
  LockKeyhole,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  buildReplaySlides,
  moveReplaySlide,
  normalizeReplayConfig,
  REPLAY_ACCENTS,
  REPLAY_TEMPLATES,
  replayMediaOptions,
  replayRangeLabel,
} from "../features/yearReplay/model";
import type {
  ReplaySlide,
  ReplaySlideConfig,
  ReplaySnapshot,
  ReplayTemplateId,
} from "../features/yearReplay/types";
import { useI18n } from "../hooks/I18nContext";
import { useMemoryReplay } from "../hooks/useMemoryReplay";
import { useSpaceCtx } from "../hooks/SpaceContext";
import { useSubscription } from "../hooks/useSubscription";
import { YEAR_REPLAY_ENABLED } from "../lib/featureFlags";
import { createReplayArchive } from "../lib/replayArchive";
import {
  createReplaySlideFile,
  downloadReplayFile,
  shareReplayFiles,
} from "../lib/yearReplayCanvas";
import "./YearReplayPage.css";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function replayCopy(lang: "en" | "vi") {
  if (lang === "vi") {
    return {
      back: "Quay lại",
      title: "Pinly Replay",
      draft: "Đang cập nhật",
      finalized: "Đã hoàn tất",
      loading: "Đang nối lại những dấu chân của bạn…",
      loadError: "Chưa thể tạo Replay lúc này.",
      retry: "Thử lại",
      noMemories: "Khoảng thời gian này chưa có kỷ niệm nào.",
      noMemoriesBody: "Lưu một nơi trên bản đồ rồi quay lại đây nhé.",
      openMap: "Mở bản đồ",
      previous: "Trang trước",
      next: "Trang sau",
      play: "Tự động phát",
      pause: "Tạm dừng",
      edit: "Chỉnh Replay",
      closeEditor: "Đóng chỉnh sửa",
      template: "Phong cách",
      lockedPlus: "Cần gói Plus",
      lockedPro: "Cần gói Pro",
      upgradeHint: "Nâng cấp gói để mở phong cách này.",
      photos: "Đổi ảnh",
      photosHint: "Chọn ảnh khác cho trang hiện tại.",
      reorder: "Sắp xếp trang",
      moveEarlier: "Đưa lên trước",
      moveLater: "Đưa xuống sau",
      hide: "Ẩn trang này",
      restore: "Hiện lại trang đã ẩn",
      colors: "Màu & chữ",
      soft: "Mềm mại",
      editorial: "Tạp chí",
      proOnly: "Tùy chỉnh này dành cho Pro.",
      export: "Lưu toàn bộ Replay",
      exporting: "Đang tạo",
      exportSuccess: "Toàn bộ Replay đã sẵn sàng.",
      exportError: "Không thể tạo Replay. Vui lòng thử lại.",
      saved: "Đã lưu thay đổi",
      saveError: "Không thể lưu thay đổi.",
      refresh: "Cập nhật dữ liệu",
      memories: "kỷ niệm",
      cities: "thành phố",
      activeDays: "ngày có dấu chân",
      distance: "quãng đường",
      month: "Tháng",
      together: "người cùng viết",
      watermark: "Bản Free sẽ có logo Pinly khi xuất ảnh.",
    };
  }
  return {
    back: "Back",
    title: "Pinly Replay",
    draft: "Still updating",
    finalized: "Finalized",
    loading: "Connecting the dots of your journey…",
    loadError: "Replay could not be created right now.",
    retry: "Try again",
    noMemories: "There are no memories in this range yet.",
    noMemoriesBody: "Save a place on your map, then come back here.",
    openMap: "Open map",
    previous: "Previous slide",
    next: "Next slide",
    play: "Play automatically",
    pause: "Pause",
    edit: "Edit Replay",
    closeEditor: "Close editor",
    template: "Style",
    lockedPlus: "Plus required",
    lockedPro: "Pro required",
    upgradeHint: "Upgrade your plan to unlock this style.",
    photos: "Swap photo",
    photosHint: "Choose another photo for this slide.",
    reorder: "Reorder slides",
    moveEarlier: "Move earlier",
    moveLater: "Move later",
    hide: "Hide this slide",
    restore: "Restore hidden slides",
    colors: "Color & type",
    soft: "Soft",
    editorial: "Editorial",
    proOnly: "This customization is available on Pro.",
    export: "Save full Replay",
    exporting: "Creating",
    exportSuccess: "Your full Replay is ready.",
    exportError: "Could not create the Replay. Please try again.",
    saved: "Changes saved",
    saveError: "Could not save changes.",
    refresh: "Refresh data",
    memories: "memories",
    cities: "cities",
    activeDays: "active days",
    distance: "travelled",
    month: "Month",
    together: "storytellers",
    watermark: "Free exports include a small Pinly mark.",
  };
}

function validDate(value: string | null) {
  return Boolean(value && DATE_PATTERN.test(value));
}

function rangeFromRoute(yearParam: string | undefined, search: URLSearchParams) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const routeYear = Number(yearParam);
  const year =
    Number.isInteger(routeYear) && routeYear >= 2020 && routeYear <= 2100
      ? routeYear
      : currentYear;
  const customStart = search.get("from");
  const customEnd = search.get("to");
  if (validDate(customStart) && validDate(customEnd)) {
    return {
      start: customStart as string,
      end: customEnd as string,
      preset: "custom" as const,
      year,
    };
  }
  return {
    start: `${year}-01-01`,
    end:
      year === currentYear
        ? `${currentYear}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
        : `${year}-12-31`,
    preset: "calendar_year" as const,
    year,
  };
}

function normalizedRoutePoints(snapshot: ReplaySnapshot) {
  const points = snapshot.route_points;
  if (points.length === 0) return [];
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return points.map((point) => ({
    ...point,
    x: 10 + ((point.lng - minLng) / Math.max(maxLng - minLng, 0.01)) * 80,
    y: 12 + (1 - (point.lat - minLat) / Math.max(maxLat - minLat, 0.01)) * 76,
  }));
}

function ReplaySlidePreview({
  slide,
  snapshot,
  templateId,
  config,
  lang,
}: {
  slide: ReplaySlide;
  snapshot: ReplaySnapshot;
  templateId: ReplayTemplateId;
  config: ReplaySlideConfig;
  lang: "en" | "vi";
}) {
  const copy = replayCopy(lang);
  const route = useMemo(() => normalizedRoutePoints(snapshot), [snapshot]);
  const routeLine = route.map((point) => `${point.x},${point.y}`).join(" ");
  const maxMonth = Math.max(
    ...snapshot.month_activity.map((month) => month.memory_count),
    1,
  );

  return (
    <article
      className={`replay-slide replay-template-${templateId} replay-slide-${slide.kind} replay-font-${config.fontStyle}`}
      style={{ "--replay-accent": config.accent } as CSSProperties}
    >
      {slide.kind !== "cover" && slide.kind !== "closing" && (
        <div className="replay-slide-kicker">{slide.eyebrow}</div>
      )}

      {slide.kind === "cover" && (
        <>
          <div className="replay-cover-media">
            {slide.media?.url ? (
              <img src={slide.media.url} alt="" />
            ) : (
              <div className="replay-photo-fallback">
                <MapPin size={38} />
              </div>
            )}
            <span>PINLY REPLAY</span>
          </div>
          <div className="replay-cover-copy">
            <i aria-hidden="true" />
            <h1>{slide.title}</h1>
            <p>{slide.subtitle}</p>
            <small>
              {snapshot.totals.memories} {copy.memories}
            </small>
          </div>
        </>
      )}

      {slide.kind === "route" && (
        <div className="replay-standard-copy replay-route-copy">
          <h2>{slide.title}</h2>
          <p>{slide.subtitle}</p>
          <div className="replay-route-map" aria-hidden="true">
            <div className="replay-map-grid" />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline points={routeLine} vectorEffect="non-scaling-stroke" />
            </svg>
            {route.map((point, index) => (
              <span
                key={point.id}
                className={
                  index === 0 || index === route.length - 1 ? "endpoint" : ""
                }
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {slide.kind === "stats" && (
        <div className="replay-standard-copy replay-stats-copy">
          <h2>{slide.title}</h2>
          <p>{slide.subtitle}</p>
          <div className="replay-stats-grid">
            <div>
              <strong>{snapshot.totals.memories}</strong>
              <span>{copy.memories}</span>
            </div>
            <div>
              <strong>{snapshot.totals.cities}</strong>
              <span>{copy.cities}</span>
            </div>
            <div>
              <strong>{snapshot.totals.active_days}</strong>
              <span>{copy.activeDays}</span>
            </div>
            <div>
              <strong>{snapshot.totals.distance_km.toLocaleString()} km</strong>
              <span>{copy.distance}</span>
            </div>
          </div>
        </div>
      )}

      {slide.kind === "highlight" && (
        <div className="replay-highlight-layout">
          <div className="replay-highlight-media">
            {slide.media?.url ? (
              <img src={slide.media.url} alt="" />
            ) : (
              <div className="replay-photo-fallback">
                <ImageIcon size={36} />
              </div>
            )}
          </div>
          <div className="replay-highlight-copy">
            <h2>{slide.title}</h2>
            <p>{slide.subtitle}</p>
            {slide.memory && (
              <time>{new Date(slide.memory.created_at).toLocaleDateString()}</time>
            )}
          </div>
        </div>
      )}

      {slide.kind === "months" && (
        <div className="replay-standard-copy replay-month-copy">
          <h2>{slide.title}</h2>
          <p>{slide.subtitle}</p>
          <div className="replay-month-chart" aria-label={copy.month}>
            {snapshot.month_activity.map((month) => (
              <div key={month.key}>
                <i
                  className={
                    month.key === snapshot.top_month.key ? "is-top" : ""
                  }
                  style={{
                    height: `${Math.max(5, (month.memory_count / maxMonth) * 100)}%`,
                  }}
                />
                <span>{month.key.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {slide.kind === "contributors" && (
        <div className="replay-standard-copy replay-contributors-copy">
          <h2>{slide.title}</h2>
          <p>{slide.subtitle}</p>
          <div className="replay-contributor-list">
            {snapshot.contributors.slice(0, 5).map((contributor) => (
              <div key={contributor.user_id}>
                <span className="replay-contributor-avatar">
                  {contributor.avatar_url ? (
                    <img src={contributor.avatar_url} alt="" />
                  ) : (
                    contributor.display_name.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span>
                  <strong>{contributor.display_name}</strong>
                  <small>
                    {contributor.memory_count} {copy.memories}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {slide.kind === "closing" && (
        <div className="replay-closing-copy">
          <div className="replay-closing-mark">P</div>
          <span>{slide.eyebrow}</span>
          <h2>{slide.title}</h2>
          <p>{slide.subtitle}</p>
          <small>{replayRangeLabel(snapshot, lang)} · PINLY</small>
        </div>
      )}

    </article>
  );
}

export function YearReplayPage() {
  const navigate = useNavigate();
  const { year: yearParam } = useParams();
  const [search] = useSearchParams();
  const { activeSpace } = useSpaceCtx();
  const { lang } = useI18n();
  const copy = replayCopy(lang);
  const range = useMemo(
    () => rangeFromRoute(yearParam, search),
    [search, yearParam],
  );
  const {
    canUseReplayTemplate,
    canCustomizeReplay,
    canUseAdvancedReplayStyling,
    replayHasWatermark,
  } = useSubscription();
  const { recap, loading, saving, refresh, saveConfig, setTemplate } =
    useMemoryReplay({
      spaceId: activeSpace?.id,
      rangeStart: range.start,
      rangeEnd: range.end,
      preset: range.preset,
      enabled: YEAR_REPLAY_ENABLED,
    });
  const [requestedIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pointerStartRef = useRef<number | null>(null);

  const config = useMemo(
    () => normalizeReplayConfig(recap?.slide_config_json),
    [recap?.slide_config_json],
  );
  const slides = useMemo(
    () =>
      recap
        ? buildReplaySlides(recap.snapshot_json, config, lang)
        : [],
    [config, lang, recap],
  );
  const allSlides = useMemo(
    () =>
      recap
        ? buildReplaySlides(
            recap.snapshot_json,
            { ...config, hiddenSlideIds: [] },
            lang,
          )
        : [],
    [config, lang, recap],
  );
  const activeIndex = Math.min(
    requestedIndex,
    Math.max(0, slides.length - 1),
  );
  const slide = slides[activeIndex];
  const mediaOptions = useMemo(
    () => (recap ? replayMediaOptions(recap.snapshot_json) : []),
    [recap],
  );

  useEffect(() => {
    if (!playing || slides.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [playing, slides.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        setPlaying(false);
        setActiveIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === "ArrowRight") {
        setPlaying(false);
        setActiveIndex((current) => Math.min(slides.length - 1, current + 1));
      }
      if (event.key === "Escape") navigate(-1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, slides.length]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [message]);

  const commitConfig = useCallback(
    async (next: ReplaySlideConfig) => {
      try {
        await saveConfig(next);
        setMessage(copy.saved);
      } catch {
        setMessage(copy.saveError);
      }
    },
    [copy.saveError, copy.saved, saveConfig],
  );

  function previousSlide() {
    setPlaying(false);
    setActiveIndex((current) => Math.max(0, current - 1));
  }

  function nextSlide() {
    setPlaying(false);
    setActiveIndex((current) => Math.min(slides.length - 1, current + 1));
  }

  function handlePointerDown(event: ReactPointerEvent) {
    pointerStartRef.current = event.clientX;
  }

  function handlePointerUp(event: ReactPointerEvent) {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (start === null) return;
    const delta = event.clientX - start;
    if (Math.abs(delta) < 45) return;
    if (delta > 0) previousSlide();
    else nextSlide();
  }

  async function chooseTemplate(templateId: ReplayTemplateId) {
    if (!canUseReplayTemplate(templateId)) {
      setMessage(copy.upgradeHint);
      return;
    }
    try {
      await setTemplate(templateId);
      setMessage(copy.saved);
    } catch {
      setMessage(copy.saveError);
    }
  }

  async function exportReplay() {
    if (!recap || slides.length === 0 || exportProgress) return;
    setExportProgress({ current: 1, total: slides.length });
    try {
      const files: File[] = [];
      for (const [index, replaySlide] of slides.entries()) {
        setExportProgress({ current: index + 1, total: slides.length });
        files.push(
          await createReplaySlideFile({
            slide: replaySlide,
            snapshot: recap.snapshot_json,
            templateId: recap.template_id,
            config,
            lang,
            watermark: replayHasWatermark,
          }),
        );
      }

      let shared = false;
      try {
        shared = await shareReplayFiles(files, copy.title);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        throw error;
      }
      if (!shared) {
        const archive = await createReplayArchive(
          files,
          recap.snapshot_json.range.start,
        );
        downloadReplayFile(archive);
      }
      setMessage(copy.exportSuccess);
    } catch {
      setMessage(copy.exportError);
    } finally {
      setExportProgress(null);
    }
  }

  if (!YEAR_REPLAY_ENABLED) return <Navigate to="/settings" replace />;

  if (loading) {
    return (
      <main className="year-replay-page replay-state-screen">
        <div className="replay-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>{copy.loading}</p>
      </main>
    );
  }

  if (!recap) {
    return (
      <main className="year-replay-page replay-state-screen">
        <Sparkles size={42} />
        <h1>{copy.loadError}</h1>
        <button type="button" onClick={() => void refresh()}>
          <RefreshCw size={18} /> {copy.retry}
        </button>
      </main>
    );
  }

  if (recap.snapshot_json.totals.memories === 0) {
    return (
      <main className="year-replay-page replay-state-screen">
        <MapPin size={46} />
        <h1>{copy.noMemories}</h1>
        <p>{copy.noMemoriesBody}</p>
        <button type="button" onClick={() => navigate("/")}>
          {copy.openMap}
        </button>
      </main>
    );
  }

  return (
    <main
      className={`year-replay-page ${editorOpen ? "editor-open" : ""}`}
      style={{ "--replay-accent": config.accent } as CSSProperties}
    >
      <header className="replay-header">
        <button
          type="button"
          className="replay-icon-button"
          onClick={() => navigate(-1)}
          aria-label={copy.back}
          title={copy.back}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="replay-header-title">
          <strong>{copy.title}</strong>
          <span>
            {replayRangeLabel(recap.snapshot_json, lang)} · {recap.status === "draft" ? copy.draft : copy.finalized}
          </span>
        </div>
        <div className="replay-header-actions">
          <button
            type="button"
            className="replay-icon-button"
            onClick={() => void refresh()}
            aria-label={copy.refresh}
            title={copy.refresh}
          >
            <RefreshCw size={19} />
          </button>
          <button
            type="button"
            className="replay-edit-button"
            onClick={() => setEditorOpen((open) => !open)}
            aria-expanded={editorOpen}
          >
            {editorOpen ? <X size={18} /> : <SlidersHorizontal size={18} />}
            <span>{editorOpen ? copy.closeEditor : copy.edit}</span>
          </button>
        </div>
      </header>

      <div className="replay-workspace">
        <section className="replay-viewer" aria-label={copy.title}>
          <div
            className="replay-stage"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
          >
            {slide && (
              <ReplaySlidePreview
                key={slide.id}
                slide={slide}
                snapshot={recap.snapshot_json}
                templateId={recap.template_id}
                config={config}
                lang={lang}
              />
            )}
          </div>

          <div className="replay-progress" aria-label={`${activeIndex + 1}/${slides.length}`}>
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={index === activeIndex ? "active" : ""}
                onClick={() => {
                  setPlaying(false);
                  setActiveIndex(index);
                }}
                aria-label={`${index + 1}`}
              />
            ))}
          </div>

          <div className="replay-controls">
            <button
              type="button"
              className="replay-icon-button"
              onClick={previousSlide}
              disabled={activeIndex === 0}
              aria-label={copy.previous}
              title={copy.previous}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              className="replay-play-button"
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? copy.pause : copy.play}
            >
              {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
              <span>{activeIndex + 1} / {slides.length}</span>
            </button>
            <button
              type="button"
              className="replay-icon-button"
              onClick={nextSlide}
              disabled={activeIndex === slides.length - 1}
              aria-label={copy.next}
              title={copy.next}
            >
              <ChevronRight size={22} />
            </button>
            <button
              type="button"
              className="replay-export-button"
              onClick={() => void exportReplay()}
              disabled={Boolean(exportProgress)}
              aria-label={
                exportProgress
                  ? `${copy.exporting} ${exportProgress.current}/${exportProgress.total}`
                  : copy.export
              }
              title={copy.export}
            >
              {exportProgress ? (
                <RefreshCw size={18} className="spin" />
              ) : (
                <Download size={18} />
              )}
              <span>
                {exportProgress
                  ? `${copy.exporting} ${exportProgress.current}/${exportProgress.total}`
                  : copy.export}
              </span>
            </button>
          </div>
        </section>

        <aside className="replay-editor" aria-hidden={!editorOpen}>
          <div className="replay-editor-header">
            <div>
              <span>{copy.edit}</span>
              <small>{saving ? "Saving…" : slide?.eyebrow}</small>
            </div>
            <button
              type="button"
              className="replay-icon-button"
              onClick={() => setEditorOpen(false)}
              aria-label={copy.closeEditor}
            >
              <X size={18} />
            </button>
          </div>

          <div className="replay-editor-scroll">
            <section className="replay-editor-section">
              <h2>{copy.template}</h2>
              <div className="replay-template-options">
                {REPLAY_TEMPLATES.map((template) => {
                  const available = canUseReplayTemplate(template.id);
                  const active = recap.template_id === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className={active ? "active" : ""}
                      onClick={() => void chooseTemplate(template.id)}
                    >
                      <span className={`replay-template-swatch ${template.className}`} />
                      <span>
                        <strong>{template.name}</strong>
                        {!available && (
                          <small>
                            <LockKeyhole size={12} />
                            {template.minimumPlan === "pro" ? copy.lockedPro : copy.lockedPlus}
                          </small>
                        )}
                      </span>
                      {active && <Check size={17} />}
                    </button>
                  );
                })}
              </div>
            </section>

            {(slide?.kind === "cover" || slide?.kind === "highlight") && (
              <section className="replay-editor-section">
                <h2>{copy.photos}</h2>
                <p>{copy.photosHint}</p>
                {canCustomizeReplay ? (
                  <div className="replay-photo-options">
                    {mediaOptions.map((media) => (
                      <button
                        key={media.id}
                        type="button"
                        className={slide.media?.id === media.id ? "active" : ""}
                        onClick={() =>
                          void commitConfig({
                            ...config,
                            photoOverrides: {
                              ...config.photoOverrides,
                              [slide.id]: media.id,
                            },
                          })
                        }
                      >
                        <img src={media.url} alt={media.title} />
                        {slide.media?.id === media.id && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="replay-locked-action"
                    onClick={() => navigate("/settings")}
                  >
                    <LockKeyhole size={16} /> {copy.lockedPlus}
                  </button>
                )}
              </section>
            )}

            <section className="replay-editor-section">
              <h2>{copy.reorder}</h2>
              {canCustomizeReplay ? (
                <div className="replay-order-actions">
                  <button
                    type="button"
                    onClick={() =>
                      slide &&
                      void commitConfig(
                        moveReplaySlide(config, slide.id, -1, allSlides),
                      )
                    }
                    disabled={activeIndex === 0}
                  >
                    <ArrowUp size={17} /> {copy.moveEarlier}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      slide &&
                      void commitConfig(
                        moveReplaySlide(config, slide.id, 1, allSlides),
                      )
                    }
                    disabled={activeIndex === slides.length - 1}
                  >
                    <ArrowDown size={17} /> {copy.moveLater}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      slide &&
                      !slide.required &&
                      void commitConfig({
                        ...config,
                        hiddenSlideIds: [
                          ...config.hiddenSlideIds.filter((id) => id !== slide.id),
                          slide.id,
                        ],
                      })
                    }
                    disabled={Boolean(slide?.required)}
                  >
                    <EyeOff size={17} /> {copy.hide}
                  </button>
                  {config.hiddenSlideIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        void commitConfig({ ...config, hiddenSlideIds: [] })
                      }
                    >
                      <RotateCcw size={17} /> {copy.restore} ({config.hiddenSlideIds.length})
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="replay-locked-action"
                  onClick={() => navigate("/settings")}
                >
                  <LockKeyhole size={16} /> {copy.lockedPlus}
                </button>
              )}
            </section>

            <section className="replay-editor-section">
              <h2>{copy.colors}</h2>
              {canUseAdvancedReplayStyling ? (
                <>
                  <div className="replay-color-options">
                    {REPLAY_ACCENTS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={config.accent === color ? "active" : ""}
                        style={{ backgroundColor: color }}
                        onClick={() =>
                          void commitConfig({ ...config, accent: color })
                        }
                        aria-label={color}
                      >
                        {config.accent === color && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                  <div className="replay-font-options">
                    {(["soft", "editorial"] as const).map((font) => (
                      <button
                        key={font}
                        type="button"
                        className={config.fontStyle === font ? "active" : ""}
                        onClick={() =>
                          void commitConfig({ ...config, fontStyle: font })
                        }
                      >
                        {font === "soft" ? copy.soft : copy.editorial}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="replay-pro-note">
                  <LockKeyhole size={15} /> {copy.proOnly}
                </p>
              )}
            </section>

            {replayHasWatermark && (
              <p className="replay-watermark-note">{copy.watermark}</p>
            )}
          </div>
        </aside>
      </div>

      {message && <div className="replay-toast" role="status">{message}</div>}
    </main>
  );
}
