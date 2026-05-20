import { useRef, useState, useEffect } from "react";
import { toPng } from "html-to-image";
import { Download, Share2, X, MapPin, Calendar } from "lucide-react";
import type { Pin } from "../../types";
import { getImageUrl } from "../../lib/cloudinary";
import { getCategory } from "../../lib/categories";
import { useI18n } from "../../hooks/I18nContext";
import { useCoupleCtx } from "../../hooks/CoupleContext";
import { Button } from "../ui/Button";

interface Props {
  pin: Pin;
  onClose: () => void;
}

/** Convert an external URL to a data URL to bypass CORS in html-to-image */
async function toDataUrl(url: string): Promise<string> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

export function ShareCard({ pin, onClose }: Props) {
  const { lang, t } = useI18n();
  const { profile, partner } = useCoupleCtx();
  const cardRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);

  const images = pin.images ?? [];
  const coverImage = images[0];
  const category = getCategory(pin.category);
  const dateStr = new Date(pin.created_at).toLocaleDateString(
    lang === "vi" ? "vi-VN" : undefined,
    { year: "numeric", month: "long", day: "numeric" },
  );
  const coupleNames = [profile?.display_name, partner?.display_name]
    .filter(Boolean)
    .join(" & ");

  // Pre-fetch cover image as data URL
  useEffect(() => {
    if (coverImage) {
      toDataUrl(getImageUrl(coverImage.cloudinary_url, 800)).then(
        setCoverDataUrl,
      );
    }
  }, [coverImage]);

  async function generateImage() {
    if (!cardRef.current) return null;
    setGenerating(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        skipFonts: true,
      });
      return dataUrl;
    } catch (err) {
      console.error("Card generation failed:", err);
      return null;
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload() {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.download = `${pin.title.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/g, "_")}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleShare() {
    const dataUrl = await generateImage();
    if (!dataUrl) return;

    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], "memory.png", { type: "image/png" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: pin.title,
          text: `${pin.title} — ${pin.address ?? ""}`,
          files: [file],
        });
      } catch {
        /* cancelled */
      }
    } else {
      handleDownload();
    }
  }

  const hasPhoto = !!coverDataUrl;

  return (
    <div className="share-card-overlay" onClick={onClose}>
      <div className="share-card-modal" onClick={(e) => e.stopPropagation()}>
        <button className="share-card-close" onClick={onClose}>
          <X size={20} />
        </button>

        {/* The card to capture */}
        <div ref={cardRef} className="share-card">
          {hasPhoto ? (
            // Photo card layout
            <>
              <div className="share-card-hero">
                <img src={coverDataUrl} alt="" />
                <div className="share-card-hero-overlay" />
                <div className="share-card-hero-content">
                  {category && (
                    <span className="share-card-chip">
                      {category.emoji} {category.label}
                    </span>
                  )}
                  <h3 className="share-card-title">{pin.title}</h3>
                </div>
              </div>
              <div className="share-card-info">
                <div className="share-card-meta">
                  <span>
                    <MapPin size={13} />{" "}
                    {pin.city ||
                      pin.address ||
                      `${pin.lat.toFixed(3)}, ${pin.lng.toFixed(3)}`}
                  </span>
                  <span>
                    <Calendar size={13} /> {dateStr}
                  </span>
                </div>
                <div className="share-card-footer">
                  <span className="share-card-couple">{coupleNames}</span>
                  <span className="share-card-brand">Mapmate</span>
                </div>
              </div>
            </>
          ) : (
            // No photo — gradient card
            <>
              <div className="share-card-gradient">
                <div className="share-card-gradient-content">
                  <div className="share-card-emoji">
                    {category?.emoji || "📍"}
                  </div>
                  <h3 className="share-card-title-lg">{pin.title}</h3>
                  <div className="share-card-meta-light">
                    <span>
                      <MapPin size={13} />{" "}
                      {pin.city ||
                        pin.address ||
                        `${pin.lat.toFixed(3)}, ${pin.lng.toFixed(3)}`}
                    </span>
                    <span>
                      <Calendar size={13} /> {dateStr}
                    </span>
                  </div>
                </div>
              </div>
              <div className="share-card-info">
                <div className="share-card-footer">
                  <span className="share-card-couple">{coupleNames}</span>
                  <span className="share-card-brand">Mapmate</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="share-card-actions">
          <Button onClick={handleShare} disabled={generating}>
            <Share2 size={16} /> {generating ? "…" : t("pin.share")}
          </Button>
          <Button
            variant="secondary"
            onClick={handleDownload}
            disabled={generating}
          >
            <Download size={16} /> {t("share.download")}
          </Button>
        </div>
      </div>
    </div>
  );
}
