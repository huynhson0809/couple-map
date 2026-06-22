import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { useCategoriesCtx } from "../../hooks/CategoriesContext";
import {
  getImageUrl,
  getVideoThumbnailUrl,
  isVideoUrl,
} from "../../lib/cloudinary";
import {
  buildTimelineCircleLayout,
  getTimelineCircleBounds,
} from "../../lib/timelineCircleLayout";
import { getPrimaryCategoryId } from "../../lib/pinCategories";
import type { Pin } from "../../types";

interface TimelineCircleViewProps {
  pins: Pin[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  lang: string;
  labels: {
    ariaLabel: string;
    newest: string;
    dragHint: string;
    zoomHint: string;
    loadMore: string;
    loadingMore: string;
  };
  resetKey: string;
  getCategory: ReturnType<typeof useCategoriesCtx>["getCategory"];
  openPinDetail: (pin: Pin) => void;
}

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

interface PointerPoint {
  x: number;
  y: number;
}

interface PinchState {
  distance: number;
  midpoint: PointerPoint;
  transform: ViewTransform;
}

interface TimelineCircleBubble {
  pin: Pin;
  node: ReturnType<typeof buildTimelineCircleLayout>[number];
  mediaUrl: string | null;
  fallback: string;
  ariaLabel: string;
  showMedia: boolean;
}

const MIN_SCALE = 0.55;
const MAX_SCALE = 2.35;
const TAP_DRAG_THRESHOLD = 7;
const LOAD_MORE_EDGE_MARGIN = 220;
const LOAD_MORE_COOLDOWN_MS = 900;
const LOAD_MORE_EXPLORATION_THRESHOLD = 80;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(a: PointerPoint, b: PointerPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: PointerPoint, b: PointerPoint): PointerPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function getPinMediaUrl(pin: Pin) {
  const mediaUrl = pin.images?.[0]?.cloudinary_url;
  if (!mediaUrl) return null;
  return isVideoUrl(mediaUrl)
    ? getVideoThumbnailUrl(mediaUrl, 320)
    : getImageUrl(mediaUrl, 320);
}

function formatPinDate(value: string, lang: string) {
  return new Date(value).toLocaleDateString(lang === "vi" ? "vi-VN" : undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getBubbleLabel(pin: Pin, lang: string) {
  const date = formatPinDate(pin.created_at, lang);
  return [pin.title, pin.city, date].filter(Boolean).join(" · ");
}

export function TimelineCircleView({
  pins,
  hasMore,
  loading,
  loadingMore,
  loadMore,
  lang,
  labels,
  resetKey,
  getCategory,
  openPinDetail,
}: TimelineCircleViewProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const transformRef = useRef<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const pointerStartRef = useRef<PointerPoint | null>(null);
  const transformStartRef = useRef<ViewTransform | null>(null);
  const pinchStartRef = useRef<PinchState | null>(null);
  const draggedRef = useRef(false);
  const tapPinIdRef = useRef<string | null>(null);
  const gestureShouldSuppressClickRef = useRef(false);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);
  const loadMoreAtRef = useRef(0);
  const explorationSinceLoadRef = useRef(0);

  const [transform, setTransform] = useState<ViewTransform>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [failedMediaIds, setFailedMediaIds] = useState<Set<string>>(() => new Set());

  const nodes = useMemo(() => buildTimelineCircleLayout(pins), [pins]);
  const bounds = useMemo(() => getTimelineCircleBounds(nodes), [nodes]);
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const pinById = useMemo(() => new Map(pins.map((pin) => [pin.id, pin])), [pins]);
  const bubbles = useMemo<TimelineCircleBubble[]>(
    () =>
      pins.flatMap((pin) => {
        const node = nodeById.get(pin.id);
        if (!node) return [];

        const category = getCategory(getPrimaryCategoryId(pin));
        const mediaUrl = getPinMediaUrl(pin);

        return [
          {
            pin,
            node,
            mediaUrl,
            fallback: pin.marker_emoji ?? category?.emoji ?? "📍",
            ariaLabel: getBubbleLabel(pin, lang),
            showMedia: Boolean(mediaUrl && !failedMediaIds.has(pin.id)),
          },
        ];
      }),
    [failedMediaIds, getCategory, lang, nodeById, pins],
  );

  const canLoadMore = hasMore && !loading && !loadingMore;

  useEffect(() => {
    pointersRef.current.clear();
    pointerStartRef.current = null;
    transformStartRef.current = null;
    pinchStartRef.current = null;
    draggedRef.current = false;
    tapPinIdRef.current = null;
    gestureShouldSuppressClickRef.current = false;
    suppressClickRef.current = false;
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = null;
    }
    loadMoreAtRef.current = 0;
    explorationSinceLoadRef.current = 0;
    const resetTransform = { x: 0, y: 0, scale: 1 };
    transformRef.current = resetTransform;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTransform(resetTransform);
  }, [resetKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailedMediaIds(new Set());
  }, [resetKey]);

  useEffect(
    () => () => {
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
        suppressClickTimerRef.current = null;
      }
    },
    [],
  );

  const maybeLoadMore = useCallback(
    (nextTransform: ViewTransform) => {
      if (!canLoadMore || nodes.length === 0) return;
      if (explorationSinceLoadRef.current < LOAD_MORE_EXPLORATION_THRESHOLD) return;

      const now = Date.now();
      if (now - loadMoreAtRef.current < LOAD_MORE_COOLDOWN_MS) return;

      const stage = stageRef.current;
      if (!stage) return;

      const rect = stage.getBoundingClientRect();
      const halfWidth = rect.width / 2;
      const halfHeight = rect.height / 2;
      const visibleMinX = (-halfWidth - nextTransform.x) / nextTransform.scale;
      const visibleMaxX = (halfWidth - nextTransform.x) / nextTransform.scale;
      const visibleMinY = (-halfHeight - nextTransform.y) / nextTransform.scale;
      const visibleMaxY = (halfHeight - nextTransform.y) / nextTransform.scale;

      const nearEdge =
        visibleMinX <= bounds.minX + LOAD_MORE_EDGE_MARGIN ||
        visibleMaxX >= bounds.maxX - LOAD_MORE_EDGE_MARGIN ||
        visibleMinY <= bounds.minY + LOAD_MORE_EDGE_MARGIN ||
        visibleMaxY >= bounds.maxY - LOAD_MORE_EDGE_MARGIN;

      if (!nearEdge) return;

      loadMoreAtRef.current = now;
      explorationSinceLoadRef.current = 0;
      loadMore();
    },
    [bounds, canLoadMore, loadMore, nodes.length],
  );

  const updateTransform = useCallback(
    (
      updater: (current: ViewTransform) => ViewTransform,
      explorationDelta = 0,
    ) => {
      const next = updater(transformRef.current);
      transformRef.current = next;
      explorationSinceLoadRef.current += Math.max(0, explorationDelta);
      maybeLoadMore(next);
      setTransform(next);
    },
    [maybeLoadMore],
  );

  const resetInteraction = useCallback(() => {
    pointersRef.current.clear();
    pointerStartRef.current = null;
    transformStartRef.current = null;
    pinchStartRef.current = null;
    draggedRef.current = false;
    tapPinIdRef.current = null;
  }, []);

  const rebasePinchFromPointers = useCallback(() => {
    if (pointersRef.current.size < 2) {
      pinchStartRef.current = null;
      return;
    }

    const [first, second] = [...pointersRef.current.values()];
    pinchStartRef.current = {
      distance: Math.max(distance(first, second), 1),
      midpoint: midpoint(first, second),
      transform: transformRef.current,
    };
  }, []);

  const beginClickSuppression = useCallback(() => {
    suppressClickRef.current = true;
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = null;
    }
  }, []);

  const endClickSuppressionSoon = useCallback(() => {
    beginClickSuppression();
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      gestureShouldSuppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 180);
  }, [beginClickSuppression]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".timeline-circle-load-more")) return;
    const bubbleTarget =
      target?.closest<HTMLButtonElement>(".timeline-circle-bubble") ?? null;
    if (bubbleTarget) {
      event.preventDefault();
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    const startingNewGesture = pointersRef.current.size === 0;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);

    if (startingNewGesture) {
      draggedRef.current = false;
      tapPinIdRef.current = bubbleTarget?.dataset.timelinePinId ?? null;
      gestureShouldSuppressClickRef.current = false;
    }

    if (pointersRef.current.size === 1) {
      pointerStartRef.current = point;
      transformStartRef.current = transformRef.current;
      pinchStartRef.current = null;
      return;
    }

    if (pointersRef.current.size >= 2) {
      tapPinIdRef.current = null;
      gestureShouldSuppressClickRef.current = true;
      beginClickSuppression();
      rebasePinchFromPointers();
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;

    const previousPoint = pointersRef.current.get(event.pointerId);
    const previousPair =
      pointersRef.current.size >= 2 ? [...pointersRef.current.values()] : null;
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size >= 2 && pinchStartRef.current) {
      const [first, second] = [...pointersRef.current.values()];
      const nextMidpoint = midpoint(first, second);
      const nextDistance = distance(first, second);
      const start = pinchStartRef.current;
      const startDistance = Math.max(start.distance, 1);
      const nextScale = clamp(
        start.transform.scale * (nextDistance / startDistance),
        MIN_SCALE,
        MAX_SCALE,
      );
      const incrementalPinchDelta =
        previousPair && previousPair.length >= 2
          ? distance(midpoint(previousPair[0], previousPair[1]), nextMidpoint) +
            Math.abs(
              Math.log(
                Math.max(nextDistance, 1) /
                  Math.max(distance(previousPair[0], previousPair[1]), 1),
              ),
            ) *
              120
          : 0;
      const stage = stageRef.current;
      const rect = stage?.getBoundingClientRect();
      const centerX = rect ? rect.left + rect.width / 2 : 0;
      const centerY = rect ? rect.top + rect.height / 2 : 0;
      const originWorldX =
        (start.midpoint.x - centerX - start.transform.x) / start.transform.scale;
      const originWorldY =
        (start.midpoint.y - centerY - start.transform.y) / start.transform.scale;

      draggedRef.current = true;
      updateTransform(() => ({
        x: nextMidpoint.x - centerX - originWorldX * nextScale,
        y: nextMidpoint.y - centerY - originWorldY * nextScale,
        scale: nextScale,
      }), incrementalPinchDelta);
      return;
    }

    if (!pointerStartRef.current || !transformStartRef.current) return;

    const dx = point.x - pointerStartRef.current.x;
    const dy = point.y - pointerStartRef.current.y;
    const movement = Math.hypot(dx, dy);
    if (!draggedRef.current) {
      if (movement <= TAP_DRAG_THRESHOLD) return;
      draggedRef.current = true;
      tapPinIdRef.current = null;
      gestureShouldSuppressClickRef.current = true;
      beginClickSuppression();
    }

    const startTransform = transformStartRef.current;
    updateTransform(
      () => ({
        ...startTransform,
        x: startTransform.x + dx,
        y: startTransform.y + dy,
      }),
      previousPoint ? distance(previousPoint, point) : 0,
    );
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;

    const isCancel = event.type === "pointercancel";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    pointersRef.current.delete(event.pointerId);

    if (draggedRef.current || gestureShouldSuppressClickRef.current) {
      beginClickSuppression();
    }

    if (pointersRef.current.size >= 2) {
      tapPinIdRef.current = null;
      rebasePinchFromPointers();
      return;
    }

    if (pointersRef.current.size === 1) {
      const [remainingPoint] = [...pointersRef.current.values()];
      pointerStartRef.current = remainingPoint;
      transformStartRef.current = transformRef.current;
      pinchStartRef.current = null;
      return;
    }

    if (gestureShouldSuppressClickRef.current) {
      endClickSuppressionSoon();
    } else if (!isCancel && tapPinIdRef.current) {
      event.preventDefault();
      const pin = pinById.get(tapPinIdRef.current);
      if (pin) {
        openPinDetail(pin);
        endClickSuppressionSoon();
      }
    }
    resetInteraction();
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const pointerX = event.clientX - centerX;
    const pointerY = event.clientY - centerY;

    updateTransform((current) => {
      const deltaMultiplier =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? rect.height
            : 1;
      const deltaY = event.deltaY * deltaMultiplier;
      const normalizedDelta = clamp(deltaY, -600, 600);
      const scaleDelta = Math.exp(-normalizedDelta * 0.0015);
      const nextScale = clamp(current.scale * scaleDelta, MIN_SCALE, MAX_SCALE);
      const worldX = (pointerX - current.x) / current.scale;
      const worldY = (pointerY - current.y) / current.scale;

      return {
        x: pointerX - worldX * nextScale,
        y: pointerY - worldY * nextScale,
        scale: nextScale,
      };
    }, Math.abs(event.deltaY) * 0.18);
  }

  function handleBubbleClick(event: React.MouseEvent<HTMLButtonElement>, pin: Pin) {
    if (suppressClickRef.current || gestureShouldSuppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    openPinDetail(pin);
  }

  if (pins.length === 0) return null;

  return (
    <section className="timeline-circle-shell" aria-label={labels.ariaLabel}>
      <div
        ref={stageRef}
        className="timeline-circle-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div
          className="timeline-circle-world"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          {bubbles.map(({ pin, node, mediaUrl, fallback, ariaLabel, showMedia }) => {
            return (
              <button
                key={pin.id}
                type="button"
                className={`timeline-circle-bubble ${node.newest ? "newest" : ""}`}
                data-timeline-pin-id={pin.id}
                style={{
                  width: node.size,
                  height: node.size,
                  left: node.x,
                  top: node.y,
                  zIndex: node.zIndex,
                }}
                aria-label={ariaLabel}
                onClick={(event) => handleBubbleClick(event, pin)}
              >
                {showMedia ? (
                  <img
                    src={mediaUrl!}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    onError={() => {
                      setFailedMediaIds((current) => {
                        const next = new Set(current);
                        next.add(pin.id);
                        return next;
                      });
                    }}
                  />
                ) : (
                  <span className="timeline-circle-fallback" aria-hidden="true">
                    <span
                      className="timeline-circle-fallback-emoji"
                      style={{ fontSize: Math.round(clamp(node.size * 0.46, 20, 50)) }}
                    >
                      {fallback}
                    </span>
                  </span>
                )}
                {node.newest && (
                  <span className="timeline-circle-newest">{labels.newest}</span>
                )}
              </button>
            );
          })}
        </div>

        {loadingMore && (
          <div className="timeline-circle-loading" role="status">
            <Loader2 size={15} aria-hidden="true" />
            <span>{labels.loadingMore}</span>
          </div>
        )}

        <div className="timeline-circle-hints" aria-hidden="true">
          <span>{labels.dragHint}</span>
          <span>{labels.zoomHint}</span>
        </div>

        {hasMore && (
          <button
            type="button"
            className="timeline-circle-load-more"
            onClick={loadMore}
            disabled={loading || loadingMore}
          >
            {loadingMore ? (
              <Loader2 size={15} aria-hidden="true" />
            ) : (
              <ImageIcon size={15} aria-hidden="true" />
            )}
            <span>{labels.loadMore}</span>
          </button>
        )}
      </div>
    </section>
  );
}
