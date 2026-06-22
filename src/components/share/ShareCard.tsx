import { useEffect, useMemo, useState } from "react";
import { Download, Share2, X, MapPin, Calendar } from "lucide-react";
import type { Pin } from "../../types";
import { getImageUrl } from "../../lib/cloudinary";
import { useI18n } from "../../hooks/I18nContext";
import { useCoupleCtx } from "../../hooks/CoupleContext";
import { useCategoriesCtx } from "../../hooks/CategoriesContext";
import { useSubscription } from "../../hooks/useSubscription";
import { Button } from "../ui/Button";
import { Logo } from "../ui/Logo";
import {
  getPrimaryCategory,
  resolvePinCategories,
} from "../../lib/pinCategories";

interface Props {
  pin: Pin;
  onClose: () => void;
}

interface ShareCardAsset {
  dataUrl: string;
  file: File;
  filename: string;
  key: string;
}

type ShareCardAssetState =
  | { key: string; status: "generating"; asset: null }
  | { key: string; status: "ready"; asset: ShareCardAsset }
  | { key: string; status: "error"; asset: null };

type FileShareNavigator = {
  share?: (data?: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
};

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
const PHOTO_TITLE_Y = PHOTO_H - 80;
const PHOTO_TITLE_FONT_SIZE = 48;
const SHARE_TAG_H = 44;
const SHARE_TAG_GAP = 20;

interface ShareTag {
  label: string;
  emoji: string;
}

function sanitizeShareFilename(title: string): string {
  const safeName = title
    .trim()
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${safeName || "memory"}.png`;
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64 = ""] = dataUrl.split(",");
  const mime = header.match(/^data:([^;]+)/)?.[1] ?? "image/png";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new File([bytes], filename, { type: mime });
}

function canShareFile(file: File): boolean {
  const nav = navigator as unknown as FileShareNavigator;

  try {
    return Boolean(nav.share && nav.canShare?.({ files: [file] }));
  } catch {
    return false;
  }
}

function isIOSDevice(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isShareAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function triggerBrowserDownload(asset: ShareCardAsset) {
  const link = document.createElement("a");
  link.download = asset.filename;
  link.href = asset.dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function openImageInNewTab(dataUrl: string, title: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;

  win.opener = null;
  win.document.title = title;
  win.document.body.style.margin = "0";
  win.document.body.style.background = "#111";

  const img = win.document.createElement("img");
  img.src = dataUrl;
  img.alt = title;
  img.style.display = "block";
  img.style.width = "100%";
  img.style.height = "auto";
  win.document.body.appendChild(img);

  return true;
}

/** Draw the Pinly logo at (x, y) with given size */
function drawLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const s = size / 72;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  ctx.fillStyle = "rgba(31,31,31,0.14)";
  ctx.beginPath();
  ctx.ellipse(36, 58, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.62;
  ctx.fillStyle = "#d84349";
  ctx.beginPath();
  ctx.moveTo(36, 62);
  ctx.lineTo(20, 46);
  ctx.lineTo(36, 37);
  ctx.lineTo(52, 46);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(18, 8, 54, 64);
  g.addColorStop(0, "#ff676d");
  g.addColorStop(1, "#ff4d57");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(36, 6);
  ctx.bezierCurveTo(20.5, 6, 9, 17.6, 9, 32.5);
  ctx.bezierCurveTo(9, 47.8, 36, 66, 36, 66);
  ctx.bezierCurveTo(36, 66, 63, 47.8, 63, 32.5);
  ctx.bezierCurveTo(63, 17.6, 51.5, 6, 36, 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#fff7f7";
  ctx.beginPath();
  ctx.arc(36, 31, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd1d4";
  ctx.beginPath();
  ctx.arc(36, 31, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff5a5f";
  ctx.beginPath();
  ctx.moveTo(36, 62);
  ctx.lineTo(30, 51);
  ctx.lineTo(36, 47);
  ctx.lineTo(42, 51);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawMapPinIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const s = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(20, 10);
  ctx.bezierCurveTo(20, 16, 12, 22, 12, 22);
  ctx.bezierCurveTo(12, 22, 4, 16, 4, 10);
  ctx.bezierCurveTo(4, 5.58, 7.58, 2, 12, 2);
  ctx.bezierCurveTo(16.42, 2, 20, 5.58, 20, 10);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(12, 10, 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCalendarIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const s = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.rect(3, 4, 18, 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(16, 2);
  ctx.lineTo(16, 6);
  ctx.moveTo(8, 2);
  ctx.lineTo(8, 6);
  ctx.moveTo(3, 10);
  ctx.lineTo(21, 10);
  ctx.stroke();
  ctx.restore();
}

function drawShareTagChip(
  ctx: CanvasRenderingContext2D,
  tag: ShareTag,
  x: number,
  y: number,
  options: { background: string; color: string },
) {
  const text = `${tag.emoji} ${tag.label}`;
  ctx.font = "600 28px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const padX = 24;
  const chipH = SHARE_TAG_H;
  const textW = ctx.measureText(text).width;
  const chipW = padX * 2 + textW;

  ctx.fillStyle = options.background;
  roundRect(ctx, x, y, chipW, chipH, chipH / 2);
  ctx.fill();

  ctx.fillStyle = options.color;
  ctx.fillText(text, x + padX, y + chipH / 2);
  ctx.textBaseline = "alphabetic";
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
  coverUrl: string,
  title: string,
  tag: ShareTag | null,
  location: string,
  dateStr: string,
  coupleNames: string,
  showWatermark = true,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;

  // Soft card background with rounded corners
  const cardBg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  cardBg.addColorStop(0, "#ffffff");
  cardBg.addColorStop(1, "#fff4f7");
  ctx.fillStyle = cardBg;
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
    const img = await loadImage(coverUrl);
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
  if (tag) {
    drawShareTagChip(
      ctx,
      tag,
      PAD,
      PHOTO_TITLE_Y - PHOTO_TITLE_FONT_SIZE - SHARE_TAG_GAP - SHARE_TAG_H + 8,
      {
        background: "rgba(255,255,255,0.2)",
        color: "#ffffff",
      },
    );
  }

  // Title on photo (bottom of photo area)
  ctx.font = `bold ${PHOTO_TITLE_FONT_SIZE}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillStyle = "#ffffff";
  wrapText(ctx, title, PAD, PHOTO_TITLE_Y, CARD_W - PAD * 2, 58, 2);

  // --- Soft info section (painted over any image overflow) ---
  const infoGrad = ctx.createLinearGradient(0, PHOTO_H, 0, CARD_H);
  infoGrad.addColorStop(0, "#fffafa");
  infoGrad.addColorStop(1, "#f9fbff");
  ctx.fillStyle = infoGrad;
  ctx.fillRect(0, PHOTO_H, CARD_W, INFO_H);

  const infoY = PHOTO_H + 50;

  // Location
  ctx.font = "400 32px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#1f2433";
  drawMapPinIcon(ctx, PAD, infoY - 25, 30, "#ff5a5f");
  ctx.fillText(location, PAD + 42, infoY);

  // Date
  drawCalendarIcon(ctx, PAD, infoY + 25, 30, "#7c879d");
  ctx.fillText(dateStr, PAD + 42, infoY + 50);

  // Divider line
  ctx.strokeStyle = "rgba(124,135,157,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, infoY + 90);
  ctx.lineTo(CARD_W - PAD, infoY + 90);
  ctx.stroke();

  // Footer: couple names left, logo + Pinly right
  const footerY = infoY + 140;
  ctx.font = "500 30px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#6f788d";
  ctx.textAlign = "left";
  ctx.fillText(coupleNames, PAD, footerY);
  if (showWatermark) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff5a5f";
    const pinlyW = ctx.measureText("Pinly").width;
    ctx.fillText("Pinly", CARD_W - PAD, footerY);
    drawLogo(ctx, CARD_W - PAD - pinlyW - 40, footerY - 28, 32);
  }
  ctx.textAlign = "left";

  ctx.restore(); // restore outer rounded clip

  return canvas.toDataURL("image/png");
}

async function drawCardNoPhoto(
  emoji: string,
  markerImageUrl: string | null,
  title: string,
  tag: ShareTag | null,
  location: string,
  dateStr: string,
  coupleNames: string,
  showWatermark = true,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;

  // Soft card background with rounded corners
  const cardBg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  cardBg.addColorStop(0, "#ffffff");
  cardBg.addColorStop(1, "#fff4f7");
  ctx.fillStyle = cardBg;
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS);
  ctx.fill();
  ctx.clip();

  // Ambient Pinly background in top portion
  const grad = ctx.createLinearGradient(0, 0, CARD_W, PHOTO_H);
  grad.addColorStop(0, "#fff7fb");
  grad.addColorStop(0.42, "#ffe1e7");
  grad.addColorStop(1, "#ff7b86");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, PHOTO_H);

  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.beginPath();
  ctx.arc(CARD_W * 0.18, PHOTO_H * 0.18, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,90,95,0.18)";
  ctx.beginPath();
  ctx.arc(CARD_W * 0.84, PHOTO_H * 0.68, 260, 0, Math.PI * 2);
  ctx.fill();

  // Category tag chip (top-left)
  if (tag) {
    drawShareTagChip(ctx, tag, PAD, 30, {
      background: "rgba(255,255,255,0.58)",
      color: "#ff4d57",
    });
  }

  // Marker icon
  if (markerImageUrl) {
    try {
      const img = await loadImage(getImageUrl(markerImageUrl, 240));
      const size = 180;
      const x = (CARD_W - size) / 2;
      const y = PHOTO_H / 2 - 180;
      ctx.fillStyle = "rgba(255,255,255,0.62)";
      roundRect(ctx, x - 22, y - 22, size + 44, size + 44, (size + 44) / 2);
      ctx.fill();
      ctx.save();
      roundRect(ctx, x, y, size, size, size / 2);
      ctx.clip();
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();
    } catch {
      ctx.font = "120px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(emoji, CARD_W / 2, PHOTO_H / 2 - 40);
    }
  } else {
    ctx.font = "120px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(emoji, CARD_W / 2, PHOTO_H / 2 - 40);
  }

  // Title on gradient area
  ctx.font = "bold 52px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#ffffff";
  wrapText(ctx, title, CARD_W / 2, PHOTO_H / 2 + 60, CARD_W - PAD * 2, 62, 2);
  ctx.textAlign = "left";

  // --- Soft info section (explicit paint) ---
  const infoGrad = ctx.createLinearGradient(0, PHOTO_H, 0, CARD_H);
  infoGrad.addColorStop(0, "#fffafa");
  infoGrad.addColorStop(1, "#f9fbff");
  ctx.fillStyle = infoGrad;
  ctx.fillRect(0, PHOTO_H, CARD_W, INFO_H);

  const infoY = PHOTO_H + 50;

  ctx.font = "400 32px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#1f2433";
  drawMapPinIcon(ctx, PAD, infoY - 25, 30, "#ff5a5f");
  ctx.fillText(location, PAD + 42, infoY);
  drawCalendarIcon(ctx, PAD, infoY + 25, 30, "#7c879d");
  ctx.fillText(dateStr, PAD + 42, infoY + 50);

  // Divider
  ctx.strokeStyle = "rgba(124,135,157,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, infoY + 90);
  ctx.lineTo(CARD_W - PAD, infoY + 90);
  ctx.stroke();

  // Footer
  const footerY = infoY + 140;
  ctx.font = "500 30px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#6f788d";
  ctx.textAlign = "left";
  ctx.fillText(coupleNames, PAD, footerY);
  if (showWatermark) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff5a5f";
    const pinlyW = ctx.measureText("Pinly").width;
    ctx.fillText("Pinly", CARD_W - PAD, footerY);
    drawLogo(ctx, CARD_W - PAD - pinlyW - 40, footerY - 28, 32);
  }

  return canvas.toDataURL("image/png");
}

// --- Component ---

export function ShareCard({ pin, onClose }: Props) {
  const { lang, t } = useI18n();
  const { profile, partner } = useCoupleCtx();
  const { allCategories } = useCategoriesCtx();
  const { hasWatermark } = useSubscription();
  const [assetState, setAssetState] = useState<ShareCardAssetState>({
    key: "",
    status: "generating",
    asset: null,
  });

  const images = pin.images ?? [];
  const coverImage = images[0];
  const coverUrl = coverImage?.cloudinary_url ?? null;
  const resolvedCategories = useMemo(
    () => resolvePinCategories(pin, allCategories),
    [allCategories, pin],
  );
  const primaryCategory = getPrimaryCategory(pin, allCategories);
  const category = resolvedCategories[0] ?? primaryCategory;
  const tag: ShareTag | null = useMemo(
    () =>
      category
        ? {
            label: category.label,
            emoji: category.emoji,
          }
        : null,
    [category],
  );
  const markerEmoji = pin.marker_emoji ?? category?.emoji ?? "📍";
  const dateStr = new Date(pin.created_at).toLocaleDateString(
    lang === "vi" ? "vi-VN" : undefined,
    { year: "numeric", month: "long", day: "numeric" },
  );
  const coupleNames = [profile?.display_name, partner?.display_name]
    .filter(Boolean)
    .join(" & ");
  const location =
    pin.city || pin.address || `${pin.lat.toFixed(3)}, ${pin.lng.toFixed(3)}`;
  const filename = useMemo(() => sanitizeShareFilename(pin.title), [pin.title]);
  const assetKey = useMemo(
    () =>
      [
        coverUrl ?? "",
        pin.title,
        tag?.label ?? "",
        tag?.emoji ?? "",
        location,
        dateStr,
        coupleNames,
        hasWatermark ? "1" : "0",
        markerEmoji,
        pin.marker_image_url ?? "",
        filename,
      ].join("\u001F"),
    [
      coupleNames,
      coverUrl,
      dateStr,
      filename,
      hasWatermark,
      location,
      markerEmoji,
      pin.marker_image_url,
      pin.title,
      tag,
    ],
  );
  const asset =
    assetState.status === "ready" && assetState.key === assetKey
      ? assetState.asset
      : null;
  const generating =
    assetState.key !== assetKey || assetState.status === "generating";
  const generationError =
    assetState.status === "error" && assetState.key === assetKey;

  useEffect(() => {
    let cancelled = false;
    const currentAssetKey = assetKey;

    async function prepareAsset() {
      try {
        const dataUrl = coverUrl
          ? await drawCardWithPhoto(
              coverUrl,
              pin.title,
              tag,
              location,
              dateStr,
              coupleNames,
              hasWatermark,
            )
          : await drawCardNoPhoto(
              markerEmoji,
              pin.marker_image_url,
              pin.title,
              tag,
              location,
              dateStr,
              coupleNames,
              hasWatermark,
            );
        const file = dataUrlToFile(dataUrl, filename);

        if (!cancelled) {
          setAssetState({
            key: currentAssetKey,
            status: "ready",
            asset: { dataUrl, file, filename, key: currentAssetKey },
          });
        }
      } catch (err) {
        console.error("Card generation failed:", err);
        if (!cancelled) {
          setAssetState({ key: currentAssetKey, status: "error", asset: null });
        }
      }
    }

    void prepareAsset();

    return () => {
      cancelled = true;
    };
  }, [
    assetKey,
    coupleNames,
    coverUrl,
    dateStr,
    filename,
    hasWatermark,
    location,
    markerEmoji,
    pin.marker_image_url,
    pin.title,
    tag,
  ]);

  function fallbackToImage(asset: ShareCardAsset) {
    if (isIOSDevice()) {
      if (openImageInNewTab(asset.dataUrl, pin.title)) return;
    } else {
      triggerBrowserDownload(asset);
      return;
    }

    triggerBrowserDownload(asset);
  }

  function shareAsset(asset: ShareCardAsset) {
    void navigator
      .share({
        title: pin.title,
        text: `${pin.title} — ${pin.address ?? ""}`,
        files: [asset.file],
      })
      .catch((err: unknown) => {
        if (!isShareAbort(err)) {
          fallbackToImage(asset);
        }
      });
  }

  function handleDownload() {
    if (!asset) return;

    if (isIOSDevice()) {
      if (canShareFile(asset.file)) {
        void navigator
          .share({ title: pin.title, files: [asset.file] })
          .catch((err: unknown) => {
            if (!isShareAbort(err)) {
              fallbackToImage(asset);
            }
          });
        return;
      }
      fallbackToImage(asset);
      return;
    }

    triggerBrowserDownload(asset);
  }

  function handleShare() {
    if (!asset) return;

    if (canShareFile(asset.file)) {
      shareAsset(asset);
      return;
    }

    fallbackToImage(asset);
  }

  const hasPhoto = !!coverUrl;
  const actionDisabled = generating || generationError || !asset;

  return (
    <div className="share-card-overlay" onClick={onClose}>
      <div className="share-card-modal" onClick={(e) => e.stopPropagation()}>
        <button className="share-card-close" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="share-card-modal-header">
          <span>{lang === "vi" ? "Thẻ kỷ niệm" : "Memory card"}</span>
          <p>
            {lang === "vi"
              ? "Xem trước ảnh sẽ được chia sẻ hoặc tải xuống."
              : "Preview the image you are about to share or download."}
          </p>
        </div>

        <div className="share-card-preview-shell">
          {/* The card to capture */}
          <div className="share-card">
            {hasPhoto ? (
              // Photo card layout
              <>
                <div className="share-card-hero">
                  <img src={coverUrl} alt="" />
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
                    {hasWatermark && (
                      <span className="share-card-brand">
                        <Logo size={16} className="share-card-brand-logo" />
                        Pinly
                      </span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              // No photo — gradient card
              <>
                <div className="share-card-gradient">
                  <div className="share-card-gradient-content">
                    <div className="share-card-emoji">
                      {pin.marker_image_url ? (
                        <img
                          src={getImageUrl(pin.marker_image_url, 160)}
                          alt=""
                        />
                      ) : (
                        markerEmoji
                      )}
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
                    {hasWatermark && (
                      <span className="share-card-brand">
                        <Logo size={16} className="share-card-brand-logo" />
                        Pinly
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="share-card-actions">
          <Button onClick={handleShare} disabled={actionDisabled}>
            <Share2 size={16} /> {generating ? "…" : t("pin.share")}
          </Button>
          <Button
            variant="secondary"
            onClick={handleDownload}
            disabled={actionDisabled}
          >
            <Download size={16} /> {t("share.download")}
          </Button>
        </div>
      </div>
    </div>
  );
}
