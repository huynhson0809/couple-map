import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

interface Props {
  images: { id: string; url: string }[];
  startIndex: number;
  onClose: () => void;
}

function buildDownloadUrl(url: string): string {
  if (url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/fl_attachment/");
  }
  return url;
}

export function ImageLightbox({ images, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [downloading, setDownloading] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const slideImgRef = useRef<HTMLImageElement | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef(0);

  // Pinch-zoom state
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const pinchStartDistRef = useRef(0);
  const pinchStartScaleRef = useRef(1);
  const pinchStartPanRef = useRef({ x: 0, y: 0 });
  const pinchStartMidRef = useRef({ x: 0, y: 0 });
  const isPinchingRef = useRef(false);
  const lastTapRef = useRef(0);

  const screenW = typeof window !== "undefined" ? window.innerWidth : 375;

  function applyImgTransform(animate = false) {
    if (!slideImgRef.current) return;
    if (animate) {
      slideImgRef.current.style.transition = "transform 0.25s ease-out";
    } else {
      slideImgRef.current.style.transition = "none";
    }
    slideImgRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${scaleRef.current})`;
  }

  function resetZoom(animate = true) {
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    applyImgTransform(animate);
  }

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1);
      else if (e.key === "ArrowRight" && index < images.length - 1) setIndex(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, index, onClose]);

  // Reset zoom when switching slides
  useEffect(() => {
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    if (slideImgRef.current) {
      slideImgRef.current.style.transition = "none";
      slideImgRef.current.style.transform = "";
    }
  }, [index]);

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      // Pinch start
      isPinchingRef.current = true;
      draggingRef.current = false;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartScaleRef.current = scaleRef.current;
      pinchStartPanRef.current = { ...panRef.current };
      pinchStartMidRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      if (trackRef.current) trackRef.current.style.transition = "none";
      return;
    }
    if (e.touches.length !== 1) return;

    // Double-tap detection
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (scaleRef.current > 1) {
        resetZoom(true);
      } else {
        scaleRef.current = 2.5;
        applyImgTransform(true);
      }
      return;
    }
    lastTapRef.current = now;

    // If zoomed, start pan instead of slide
    if (scaleRef.current > 1) {
      draggingRef.current = false;
      isPinchingRef.current = false;
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      pinchStartPanRef.current = { ...panRef.current };
      if (slideImgRef.current) slideImgRef.current.style.transition = "none";
      return;
    }

    draggingRef.current = true;
    isPinchingRef.current = false;
    dragOffsetRef.current = 0;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    startTimeRef.current = Date.now();
    if (trackRef.current) trackRef.current.style.transition = "none";
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();

    if (e.touches.length === 2 && isPinchingRef.current) {
      // Pinch zoom
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const currentDist = Math.hypot(dx, dy);
      const ratio = currentDist / Math.max(pinchStartDistRef.current, 1);
      scaleRef.current = Math.min(5, Math.max(1, pinchStartScaleRef.current * ratio));

      // Pan follows midpoint
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      panRef.current = {
        x: pinchStartPanRef.current.x + (mid.x - pinchStartMidRef.current.x),
        y: pinchStartPanRef.current.y + (mid.y - pinchStartMidRef.current.y),
      };
      applyImgTransform(false);
      return;
    }

    if (e.touches.length !== 1) return;

    // Pan when zoomed
    if (scaleRef.current > 1 && !draggingRef.current) {
      const dx = e.touches[0].clientX - startXRef.current;
      const dy = e.touches[0].clientY - startYRef.current;
      panRef.current = {
        x: pinchStartPanRef.current.x + dx,
        y: pinchStartPanRef.current.y + dy,
      };
      applyImgTransform(false);
      return;
    }

    if (!draggingRef.current) return;

    const dx = e.touches[0].clientX - startXRef.current;
    // Rubber band at edges
    let offset = dx;
    if ((dx > 0 && index === 0) || (dx < 0 && index === images.length - 1)) {
      offset = dx * 0.3;
    }
    dragOffsetRef.current = offset;
    if (trackRef.current) {
      const base = -index * screenW;
      trackRef.current.style.transform = `translateX(${base + offset}px)`;
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    // End pinch
    if (isPinchingRef.current && e.touches.length < 2) {
      isPinchingRef.current = false;
      if (scaleRef.current <= 1.05) {
        resetZoom(true);
      }
      return;
    }

    // End pan when zoomed
    if (scaleRef.current > 1 && !draggingRef.current) {
      return;
    }

    if (!draggingRef.current) return;
    draggingRef.current = false;
    const dx = dragOffsetRef.current;
    const elapsed = Date.now() - startTimeRef.current;
    const velocity = Math.abs(dx) / Math.max(elapsed, 1);

    let newIndex = index;
    if ((dx < -40 || (velocity > 0.3 && dx < 0)) && index < images.length - 1) {
      newIndex = index + 1;
    } else if ((dx > 40 || (velocity > 0.3 && dx > 0)) && index > 0) {
      newIndex = index - 1;
    }

    setIndex(newIndex);
    resetZoom(false);
    if (trackRef.current) {
      trackRef.current.style.transition = "transform 0.3s ease-out";
      trackRef.current.style.transform = `translateX(${-newIndex * screenW}px)`;
    }
  }

  async function handleDownload() {
    const current = images[index];
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
      window.open(buildDownloadUrl(images[index].url), "_blank");
    } finally {
      setDownloading(false);
    }
  }

  if (images.length === 0) return null;

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
        className="lightbox-stage"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          ref={trackRef}
          className="lightbox-track"
          style={{
            transform: `translateX(${-index * screenW}px)`,
            transition: "transform 0.3s ease-out",
          }}
        >
          {images.map((img, i) => (
            <div key={img.id} className="lightbox-slide">
              <img
                ref={i === index ? slideImgRef : undefined}
                src={img.url}
                alt=""
                draggable={false}
              />
            </div>
          ))}
        </div>
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
