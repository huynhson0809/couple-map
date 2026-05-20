import { useState, useEffect } from "react";
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

// --- Canvas-based card generation (works on iOS) ---

const CARD_W = 1080;
const CARD_H = 1350;
const PAD = 60;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
): number {
  const words = text.split(" ");
  let line = "";
  let lines = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      lines++;
      if (lines >= maxLines) {
        ctx.fillText(line.trimEnd() + "…", x, y);
        return y + lineHeight;
      }
      ctx.fillText(line.trimEnd(), x, y);
      line = words[i] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trimEnd(), x, y);
  return y + lineHeight;
}

async function drawCardWithPhoto(
  coverDataUrl: string,
  title: string,
  categoryLabel: string | null,
  location: string,
  dateStr: string,
  coupleNames: string,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;

  // Draw cover image (fill entire card)
  try {
    const img = await loadImage(coverDataUrl);
    const scale = Math.max(CARD_W / img.width, CARD_H / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
  } catch {
    // If image fails, fill with gradient
    const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    grad.addColorStop(0, "#667eea");
    grad.addColorStop(1, "#764ba2");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

  // Dark gradient overlay at bottom
  const grad = ctx.createLinearGradient(0, CARD_H * 0.4, 0, CARD_H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.4)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Category chip
  let textY = CARD_H - 320;
  if (categoryLabel) {
    ctx.font = "500 32px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(categoryLabel, PAD, textY);
    textY += 50;
  }

  // Title
  ctx.font = "bold 56px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#ffffff";
  textY = wrapText(ctx, title, PAD, textY, CARD_W - PAD * 2, 68, 3);
  textY += 16;

  // Location
  ctx.font = "400 30px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText("📍 " + location, PAD, textY);
  textY += 44;

  // Date
  ctx.fillText("📅 " + dateStr, PAD, textY);
  textY += 60;

  // Footer
  ctx.font = "500 28px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(coupleNames, PAD, CARD_H - PAD);
  ctx.textAlign = "right";
  ctx.fillText("Mapmate", CARD_W - PAD, CARD_H - PAD);
  ctx.textAlign = "left";

  return canvas.toDataURL("image/png");
}

async function drawCardNoPhoto(
  emoji: string,
  title: string,
  location: string,
  dateStr: string,
  coupleNames: string,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  grad.addColorStop(0, "#667eea");
  grad.addColorStop(1, "#764ba2");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Emoji
  ctx.font = "120px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(emoji, CARD_W / 2, CARD_H / 2 - 140);

  // Title
  ctx.font = "bold 56px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#ffffff";
  wrapText(ctx, title, CARD_W / 2, CARD_H / 2 - 20, CARD_W - PAD * 2, 68, 3);

  // Location
  ctx.font = "400 30px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText("📍 " + location, CARD_W / 2, CARD_H / 2 + 120);

  // Date
  ctx.fillText("📅 " + dateStr, CARD_W / 2, CARD_H / 2 + 170);

  // Footer
  ctx.font = "500 28px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.textAlign = "left";
  ctx.fillText(coupleNames, PAD, CARD_H - PAD);
  ctx.textAlign = "right";
  ctx.fillText("Mapmate", CARD_W - PAD, CARD_H - PAD);

  return canvas.toDataURL("image/png");
}

// --- Component ---

export function ShareCard({ pin, onClose }: Props) {
  const { lang, t } = useI18n();
  const { profile, partner } = useCoupleCtx();
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
  const location =
    pin.city || pin.address || `${pin.lat.toFixed(3)}, ${pin.lng.toFixed(3)}`;

  // Pre-fetch cover image as data URL
  useEffect(() => {
    if (coverImage) {
      const url = getImageUrl(coverImage.cloudinary_url, 1080);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const cx = c.getContext("2d");
          if (!cx) return;
          cx.drawImage(img, 0, 0);
          setCoverDataUrl(c.toDataURL("image/jpeg", 0.92));
        } catch {
          setCoverDataUrl(null);
        }
      };
      img.onerror = () => setCoverDataUrl(null);
      img.src = url;
    }
  }, [coverImage]);

  async function generateImage(): Promise<string | null> {
    setGenerating(true);
    try {
      if (coverDataUrl) {
        return await drawCardWithPhoto(
          coverDataUrl,
          pin.title,
          category ? `${category.emoji} ${category.label}` : null,
          location,
          dateStr,
          coupleNames,
        );
      } else {
        return await drawCardNoPhoto(
          category?.emoji || "📍",
          pin.title,
          location,
          dateStr,
          coupleNames,
        );
      }
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

    // iOS Safari doesn't support <a download> — use share or open in new tab
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      // Try Web Share first
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], "memory.png", { type: "image/png" });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      } catch { /* fall through */ }
      // Fallback: open image in new tab so user can long-press to save
      const win = window.open();
      if (win) {
        win.document.write(
          `<img src="${dataUrl}" style="max-width:100%;height:auto" />`,
        );
        win.document.title = pin.title;
      }
    } else {
      const link = document.createElement("a");
      link.download = `${pin.title.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/g, "_")}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  async function handleShare() {
    const dataUrl = await generateImage();
    if (!dataUrl) return;

    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "memory.png", { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: pin.title,
          text: `${pin.title} — ${pin.address ?? ""}`,
          files: [file],
        });
        return;
      }
    } catch { /* cancelled or unsupported */ }

    // Fallback
    handleDownload();
  }

  const hasPhoto = !!coverDataUrl;

  return (
    <div className="share-card-overlay" onClick={onClose}>
      <div className="share-card-modal" onClick={(e) => e.stopPropagation()}>
        <button className="share-card-close" onClick={onClose}>
          <X size={20} />
        </button>

        {/* The card to capture */}
        <div className="share-card">
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
