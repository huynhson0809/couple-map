import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";

interface Props {
  images: { id: string; url: string }[];
  startIndex: number;
  onClose: () => void;
}

function buildDownloadUrl(url: string): string {
  // Cloudinary: insert fl_attachment to force download
  if (url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/fl_attachment/");
  }
  return url;
}

export function ImageLightbox({ images, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIndex((i) => (i > 0 ? i - 1 : i));
      else if (e.key === "ArrowRight")
        setIndex((i) => (i < images.length - 1 ? i + 1 : i));
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
      // fallback: open in new tab
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
          {index + 1} / {images.length}
        </div>
        <div className="lightbox-actions">
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

      <div className="lightbox-stage" onClick={onClose}>
        <img
          src={current.url}
          alt=""
          className="lightbox-img"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="lightbox-nav prev"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i > 0 ? i - 1 : images.length - 1));
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
              setIndex((i) => (i < images.length - 1 ? i + 1 : 0));
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
