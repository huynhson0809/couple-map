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

const RADIUS = 48;
const INFO_H = 280; // white info section height
const PHOTO_H = CARD_H - INFO_H;

/** Draw the Mapmate pin logo at (x, y) with given size */
function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 44; // original path fits in ~44px box
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  // Back pin (faded)
  ctx.globalAlpha = 0.55;
  const g1 = ctx.createLinearGradient(0, 0, 32, 44);
  g1.addColorStop(0, "#fb7185");
  g1.addColorStop(1, "#f43f5e");
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.bezierCurveTo(7, 0, 0, 7, 0, 16);
  ctx.bezierCurveTo(0, 26, 16, 44, 16, 44);
  ctx.bezierCurveTo(16, 44, 32, 26, 32, 16);
  ctx.bezierCurveTo(32, 7, 25, 0, 16, 0);
  ctx.closePath();
  ctx.fill();

  // Front pin
  ctx.globalAlpha = 1;
  const g2 = ctx.createLinearGradient(10, 4, 44, 44);
  g2.addColorStop(0, "#ff6b6b");
  g2.addColorStop(0.55, "#ec4899");
  g2.addColorStop(1, "#a855f7");
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.moveTo(30, 8);
  ctx.bezierCurveTo(21, 8, 14, 15, 14, 24);
  ctx.bezierCurveTo(14, 34, 30, 52, 30, 52);
  ctx.bezierCurveTo(30, 52, 46, 34, 46, 24);
  ctx.bezierCurveTo(46, 15, 39, 8, 30, 8);
  ctx.closePath();
  ctx.fill();

  // Heart
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(30, 32);
  ctx.bezierCurveTo(30, 32, 23, 27, 23, 22);
  ctx.bezierCurveTo(23, 19.5, 25, 18, 27, 18);
  ctx.bezierCurveTo(28.5, 18, 30, 19, 30, 19);
  ctx.bezierCurveTo(30, 19, 31.5, 18, 33, 18);
  ctx.bezierCurveTo(35, 18, 37, 19.5, 37, 22);
  ctx.bezierCurveTo(37, 27, 30, 32, 30, 32);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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

  // White card background with rounded corners
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS);
  ctx.fill();

  // Clip to rounded card shape
  ctx.save();
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS);
  ctx.clip();

  // Draw cover image in top portion (clipped to PHOTO_H)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CARD_W, PHOTO_H);
  ctx.clip();
  try {
    const img = await loadImage(coverDataUrl);
    const scale = Math.max(CARD_W / img.width, PHOTO_H / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (CARD_W - w) / 2, (PHOTO_H - h) / 2, w, h);
  } catch {
    const grad = ctx.createLinearGradient(0, 0, CARD_W, PHOTO_H);
    grad.addColorStop(0, "#667eea");
    grad.addColorStop(1, "#764ba2");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_W, PHOTO_H);
  }
  ctx.restore();

  // Gradient overlay at bottom of photo for title readability
  const grad = ctx.createLinearGradient(0, PHOTO_H * 0.5, 0, PHOTO_H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, PHOTO_H * 0.5, CARD_W, PHOTO_H * 0.5);

  // Category tag chip (top-left of photo)
  if (categoryLabel) {
    ctx.font = "500 28px -apple-system, BlinkMacSystemFont, sans-serif";
    const chipW = ctx.measureText(categoryLabel).width + 32;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    roundRect(ctx, PAD, 30, chipW, 44, 22);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(categoryLabel, PAD + 16, 60);
  }

  // Title on photo (bottom of photo area)
  ctx.font = "bold 52px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#ffffff";
  wrapText(ctx, title, PAD, PHOTO_H - 80, CARD_W - PAD * 2, 62, 2);

  // --- White info section (painted over any image overflow) ---
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, PHOTO_H, CARD_W, INFO_H);

  const infoY = PHOTO_H + 50;

  // Location
  ctx.font = "400 32px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#333333";
  ctx.fillText("📍 " + location, PAD, infoY);

  // Date
  ctx.fillText("📅 " + dateStr, PAD, infoY + 50);

  // Divider line
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, infoY + 90);
  ctx.lineTo(CARD_W - PAD, infoY + 90);
  ctx.stroke();

  // Footer: couple names left, logo + Mapmate right
  const footerY = infoY + 140;
  ctx.font = "500 30px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#555555";
  ctx.textAlign = "left";
  ctx.fillText(coupleNames, PAD, footerY);
  ctx.textAlign = "right";
  ctx.fillStyle = "#e8685a";
  const mapmateW = ctx.measureText("Mapmate").width;
  ctx.fillText("Mapmate", CARD_W - PAD, footerY);
  drawLogo(ctx, CARD_W - PAD - mapmateW - 40, footerY - 28, 32);
  ctx.textAlign = "left";

  ctx.restore(); // restore outer rounded clip

  return canvas.toDataURL("image/png");
}

async function drawCardNoPhoto(
  emoji: string,
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

  // White card background with rounded corners
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS);
  ctx.fill();
  ctx.clip();

  // Gradient background in top portion
  const grad = ctx.createLinearGradient(0, 0, CARD_W, PHOTO_H);
  grad.addColorStop(0, "#667eea");
  grad.addColorStop(1, "#764ba2");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, PHOTO_H);

  // Category tag chip (top-left)
  if (categoryLabel) {
    ctx.font = "500 28px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    const chipW = ctx.measureText(categoryLabel).width + 32;
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    roundRect(ctx, PAD, 30, chipW, 44, 22);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(categoryLabel, PAD + 16, 60);
  }

  // Emoji
  ctx.font = "120px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(emoji, CARD_W / 2, PHOTO_H / 2 - 40);

  // Title on gradient area
  ctx.font = "bold 52px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#ffffff";
  wrapText(ctx, title, CARD_W / 2, PHOTO_H / 2 + 60, CARD_W - PAD * 2, 62, 2);
  ctx.textAlign = "left";

  // --- White info section (explicit paint) ---
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, PHOTO_H, CARD_W, INFO_H);

  const infoY = PHOTO_H + 50;

  ctx.font = "400 32px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#333333";
  ctx.fillText("📍 " + location, PAD, infoY);
  ctx.fillText("📅 " + dateStr, PAD, infoY + 50);

  // Divider
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, infoY + 90);
  ctx.lineTo(CARD_W - PAD, infoY + 90);
  ctx.stroke();

  // Footer
  const footerY = infoY + 140;
  ctx.font = "500 30px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#555555";
  ctx.textAlign = "left";
  ctx.fillText(coupleNames, PAD, footerY);
  ctx.textAlign = "right";
  ctx.fillStyle = "#e8685a";
  const mapmateW = ctx.measureText("Mapmate").width;
  ctx.fillText("Mapmate", CARD_W - PAD, footerY);
  drawLogo(ctx, CARD_W - PAD - mapmateW - 40, footerY - 28, 32);

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
          category ? `${category.emoji} ${category.label}` : null,
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
