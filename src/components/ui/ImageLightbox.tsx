import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

interface Props {
  images: { id: string; url: string }[];
  startIndex: number;
  onClose: () => void;
}

type Point = { x: number; y: number };

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

function buildDownloadUrl(url: string): string {
  if (url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/fl_attachment/");
  }
  return url;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function ImageLightbox({ images, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [downloading, setDownloading] = useState(false);

  // Use refs for transform to avoid re-renders during gestures
  const scaleRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Gesture tracking refs
  const touchesRef = useRef<Map<number, Point>>(new Map());
  const gestureStartRef = useRef<{
    scale: number;
    offset: Point;
    pinchDist: number | null;
    pinchMid: Point | null;
    panStart: Point | null;
    time: number;
    startX: number;
  } | null>(null);
  const isGesturingRef = useRef(false);
  const swipeOffsetRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const lastTapRef = useRef(0);

  const applyTransform = useCallback(() => {
    if (!imgRef.current) return;
    const s = scaleRef.current;
    const o = offsetRef.current;
    imgRef.current.style.transform = `translate3d(${o.x}px, ${o.y}px, 0) scale(${s})`;
  }, []);

  const applySwipeTransform = useCallback(() => {
    if (!stageRef.current) return;
    stageRef.current.style.transform = `translateX(${swipeOffsetRef.current}px)`;
  }, []);

  function resetTransform(animate = true) {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    if (imgRef.current) {
      if (animate) {
        imgRef.current.style.transition = "transform 0.2s ease-out";
        setTimeout(() => {
          if (imgRef.current) imgRef.current.style.transition = "";
        }, 200);
      }
      applyTransform();
    }
  }

  function goTo(nextIndex: number) {
    resetTransform(false);
    swipeOffsetRef.current = 0;
    if (stageRef.current) stageRef.current.style.transform = "";
    setIndex(nextIndex);
  }

  // Lock body scroll
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, []);

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) goTo(index - 1);
      else if (e.key === "ArrowRight" && index < images.length - 1)
        goTo(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, index, onClose]);

  // Reset transform on index change
  useEffect(() => {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    swipeOffsetRef.current = 0;
    if (imgRef.current) {
      imgRef.current.style.transition = "";
      imgRef.current.style.transform = "translate3d(0,0,0) scale(1)";
    }
    if (stageRef.current) stageRef.current.style.transform = "";
  }, [index]);

  if (images.length === 0) return null;
  const current = images[index];

  function handleTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    if (imgRef.current) imgRef.current.style.transition = "";
    if (stageRef.current) stageRef.current.style.transition = "";

    const touches = e.touches;
    touchesRef.current.clear();
    for (let i = 0; i < touches.length; i++) {
      touchesRef.current.set(touches[i].identifier, {
        x: touches[i].clientX,
        y: touches[i].clientY,
      });
    }

    let pinchDist: number | null = null;
    let pinchMid: Point | null = null;
    if (touches.length >= 2) {
      const pts = Array.from(touchesRef.current.values());
      pinchDist = dist(pts[0], pts[1]);
      pinchMid = midpoint(pts[0], pts[1]);
    }

    gestureStartRef.current = {
      scale: scaleRef.current,
      offset: { ...offsetRef.current },
      pinchDist,
      pinchMid,
      panStart:
        touches.length === 1
          ? { x: touches[0].clientX, y: touches[0].clientY }
          : null,
      time: Date.now(),
      startX: touches.length === 1 ? touches[0].clientX : 0,
    };
    isGesturingRef.current = true;
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!gestureStartRef.current) return;

    const touches = e.touches;
    touchesRef.current.clear();
    for (let i = 0; i < touches.length; i++) {
      touchesRef.current.set(touches[i].identifier, {
        x: touches[i].clientX,
        y: touches[i].clientY,
      });
    }

    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(() => {
      if (!gestureStartRef.current) return;

      if (touches.length >= 2) {
        // Pinch zoom
        const pts = Array.from(touchesRef.current.values());
        const currentDist = dist(pts[0], pts[1]);
        const startDist = gestureStartRef.current.pinchDist;

        if (startDist && startDist > 0) {
          const ratio = currentDist / startDist;
          scaleRef.current = clamp(
            gestureStartRef.current.scale * ratio,
            MIN_SCALE,
            MAX_SCALE,
          );
        }

        // Pan during pinch
        const currentMid = midpoint(pts[0], pts[1]);
        const startMid = gestureStartRef.current.pinchMid;
        if (startMid) {
          offsetRef.current = {
            x: gestureStartRef.current.offset.x + (currentMid.x - startMid.x),
            y: gestureStartRef.current.offset.y + (currentMid.y - startMid.y),
          };
        }
        applyTransform();
      } else if (touches.length === 1 && gestureStartRef.current.panStart) {
        const dx = touches[0].clientX - gestureStartRef.current.panStart.x;
        const dy = touches[0].clientY - gestureStartRef.current.panStart.y;

        if (scaleRef.current > 1) {
          // Pan when zoomed
          offsetRef.current = {
            x: gestureStartRef.current.offset.x + dx,
            y: gestureStartRef.current.offset.y + dy,
          };
          applyTransform();
        } else {
          // Swipe to navigate when not zoomed
          swipeOffsetRef.current = dx;
          applySwipeTransform();
        }
      }
    });
  }

  function handleTouchEnd(e: React.TouchEvent) {
    e.stopPropagation();
    if (!gestureStartRef.current) return;
    cancelAnimationFrame(animFrameRef.current);

    const start = gestureStartRef.current;

    if (e.touches.length === 0) {
      isGesturingRef.current = false;

      // Handle swipe navigation (only when not zoomed)
      if (scaleRef.current <= 1 && start.panStart) {
        const swipeDx = swipeOffsetRef.current;
        const elapsed = Date.now() - start.time;
        const velocity = Math.abs(swipeDx) / Math.max(elapsed, 1);

        const shouldSwipe =
          Math.abs(swipeDx) > SWIPE_THRESHOLD ||
          velocity > SWIPE_VELOCITY_THRESHOLD;

        if (shouldSwipe && swipeDx > 0 && index > 0) {
          // Swipe right → previous
          if (stageRef.current) {
            stageRef.current.style.transition = "transform 0.2s ease-out";
            stageRef.current.style.transform = `translateX(${window.innerWidth}px)`;
            setTimeout(() => goTo(index - 1), 200);
          } else {
            goTo(index - 1);
          }
          gestureStartRef.current = null;
          return;
        } else if (shouldSwipe && swipeDx < 0 && index < images.length - 1) {
          // Swipe left → next
          if (stageRef.current) {
            stageRef.current.style.transition = "transform 0.2s ease-out";
            stageRef.current.style.transform = `translateX(-${window.innerWidth}px)`;
            setTimeout(() => goTo(index + 1), 200);
          } else {
            goTo(index + 1);
          }
          gestureStartRef.current = null;
          return;
        } else {
          // Snap back
          swipeOffsetRef.current = 0;
          if (stageRef.current) {
            stageRef.current.style.transition = "transform 0.2s ease-out";
            stageRef.current.style.transform = "";
            setTimeout(() => {
              if (stageRef.current) stageRef.current.style.transition = "";
            }, 200);
          }
        }
      }

      // Snap back if scale dropped below 1
      if (scaleRef.current <= 1.05) {
        resetTransform(true);
      }

      gestureStartRef.current = null;
    } else {
      // Finger lifted but others remain - update gesture start for remaining finger
      const remaining = e.touches;
      touchesRef.current.clear();
      for (let i = 0; i < remaining.length; i++) {
        touchesRef.current.set(remaining[i].identifier, {
          x: remaining[i].clientX,
          y: remaining[i].clientY,
        });
      }
      gestureStartRef.current = {
        scale: scaleRef.current,
        offset: { ...offsetRef.current },
        pinchDist: null,
        pinchMid: null,
        panStart:
          remaining.length === 1
            ? { x: remaining[0].clientX, y: remaining[0].clientY }
            : null,
        time: Date.now(),
        startX: remaining.length === 1 ? remaining[0].clientX : 0,
      };
    }
  }

  function handleDoubleTap(e: React.TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (scaleRef.current > 1) {
      resetTransform(true);
    } else {
      scaleRef.current = 2.5;
      if (imgRef.current) {
        imgRef.current.style.transition = "transform 0.2s ease-out";
        applyTransform();
        setTimeout(() => {
          if (imgRef.current) imgRef.current.style.transition = "";
        }, 200);
      }
    }
  }

  function handleTap(e: React.TouchEvent) {
    if (e.touches.length > 1) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleDoubleTap(e);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }

  async function handleDownload() {
    if (!current) return;
    setDownloading(true);
    try {
      const url = buildDownloadUrl(current.url);
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pinly-${current.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      window.open(buildDownloadUrl(current.url), "_blank");
    } finally {
      setDownloading(false);
    }
  }

  return createPortal(
    <div className="lightbox" role="dialog" aria-label="Image viewer">
      <div className="lightbox-topbar">
        <div className="lightbox-count">
          {index + 1} / {images.length}
        </div>
        <div className="lightbox-actions">
          <button
            type="button"
            className="lightbox-btn"
            onClick={handleDownload}
            disabled={downloading}
            aria-label="Download"
          >
            <Download size={20} />
          </button>
          <button
            type="button"
            className="lightbox-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="lightbox-stage"
        onTouchStart={(e) => {
          handleTap(e);
          handleTouchStart(e);
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <img
          ref={imgRef}
          key={current.id}
          src={current.url}
          alt=""
          className="lightbox-img"
          draggable={false}
        />
      </div>

      {images.length > 1 && (
        <div className="lightbox-dots">
          {images.map((_, i) => (
            <span
              key={i}
              className={`lightbox-dot ${i === index ? "active" : ""}`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
