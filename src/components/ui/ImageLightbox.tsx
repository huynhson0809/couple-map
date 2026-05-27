import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

interface Props {
  images: { id: string; url: string }[];
  startIndex: number;
  onClose: () => void;
}

type Point = { x: number; y: number };

const MIN_SCALE = 1;
const MAX_SCALE = 5;

function buildDownloadUrl(url: string): string {
  if (url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/fl_attachment/");
  }
  return url;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function ImageLightbox({ images, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [downloading, setDownloading] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const pointersRef = useRef(new Map<number, Point>());
  const lastPanRef = useRef<Point | null>(null);
  const lastPinchDistanceRef = useRef<number | null>(null);

  function resetTransform() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    pointersRef.current.clear();
    lastPanRef.current = null;
    lastPinchDistanceRef.current = null;
    setDragging(false);
  }

  function goToIndex(nextIndex: number | ((current: number) => number)) {
    resetTransform();
    setIndex((current) =>
      typeof nextIndex === "function" ? nextIndex(current) : nextIndex,
    );
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goToIndex((i) => (i > 0 ? i - 1 : i));
      else if (e.key === "ArrowRight")
        goToIndex((i) => (i < images.length - 1 ? i + 1 : i));
      else if (e.key === "+" || e.key === "=") zoomBy(0.5);
      else if (e.key === "-") zoomBy(-0.5);
      else if (e.key === "0") resetTransform();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

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

  if (images.length === 0) return null;
  const current = images[index];

  function zoomBy(delta: number) {
    setScale((currentScale) => {
      const next = clamp(currentScale + delta, MIN_SCALE, MAX_SCALE);
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    e.stopPropagation();
    zoomBy(e.deltaY < 0 ? 0.35 : -0.35);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLImageElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1 && scale > 1) {
      setDragging(true);
      lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      lastPinchDistanceRef.current = distance(a, b);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLImageElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    e.stopPropagation();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const nextDistance = distance(a, b);
      const lastDistance = lastPinchDistanceRef.current ?? nextDistance;
      lastPinchDistanceRef.current = nextDistance;
      if (lastDistance > 0) {
        setScale((currentScale) =>
          clamp(currentScale * (nextDistance / lastDistance), MIN_SCALE, MAX_SCALE),
        );
      }
      return;
    }

    if (scale <= 1 || !lastPanRef.current) return;
    const dx = e.clientX - lastPanRef.current.x;
    const dy = e.clientY - lastPanRef.current.y;
    lastPanRef.current = { x: e.clientX, y: e.clientY };
    setOffset((currentOffset) => ({
      x: currentOffset.x + dx,
      y: currentOffset.y + dy,
    }));
  }

  function handlePointerEnd(e: React.PointerEvent<HTMLImageElement>) {
    e.stopPropagation();
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) lastPinchDistanceRef.current = null;
    if (pointersRef.current.size === 0) {
      setDragging(false);
      lastPanRef.current = null;
      if (scale <= 1.02) resetTransform();
    }
  }

  function handleDoubleClick(e: React.MouseEvent<HTMLImageElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (scale > 1) {
      resetTransform();
    } else {
      setScale(2.5);
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
    <div
      className="lightbox"
      onClick={onClose}
      role="dialog"
      aria-label="Image viewer"
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div className="lightbox-topbar" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-count">
          {index + 1} / {images.length} {scale > 1 ? `· ${Math.round(scale * 100)}%` : ""}
        </div>
        <div className="lightbox-actions">
          <button
            type="button"
            className="lightbox-btn"
            onClick={() => zoomBy(-0.5)}
            disabled={scale <= MIN_SCALE}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut size={19} />
          </button>
          <button
            type="button"
            className="lightbox-btn"
            onClick={() => zoomBy(0.5)}
            disabled={scale >= MAX_SCALE}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn size={19} />
          </button>
          <button
            type="button"
            className="lightbox-btn"
            onClick={resetTransform}
            disabled={scale === 1 && offset.x === 0 && offset.y === 0}
            aria-label="Reset zoom"
            title="Reset zoom"
          >
            <RotateCcw size={18} />
          </button>
          <button
            type="button"
            className="lightbox-btn"
            onClick={handleDownload}
            disabled={downloading}
            aria-label="Download"
            title="Download"
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
        className={`lightbox-stage ${scale > 1 ? "zoomed" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onWheel={handleWheel}
      >
        <img
          src={current.url}
          alt=""
          className={`lightbox-img ${dragging ? "dragging" : ""}`}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
          draggable={false}
        />
      </div>

      {images.length > 1 && scale === 1 && (
        <>
          <button
            type="button"
            className="lightbox-nav prev"
            onClick={(e) => {
              e.stopPropagation();
              goToIndex((i) => (i > 0 ? i - 1 : images.length - 1));
            }}
            aria-label="Previous"
          >
            <ChevronLeft size={28} />
          </button>
          <button
            type="button"
            className="lightbox-nav next"
            onClick={(e) => {
              e.stopPropagation();
              goToIndex((i) => (i < images.length - 1 ? i + 1 : 0));
            }}
            aria-label="Next"
          >
            <ChevronRight size={28} />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
