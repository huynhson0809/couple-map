import { replayRangeLabel } from "../features/yearReplay/model";
import type {
  ReplaySlide,
  ReplaySlideConfig,
  ReplaySnapshot,
  ReplayTemplateId,
} from "../features/yearReplay/types";
import type { Lang } from "../hooks/I18nContext";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
} from "./localeFormat";

export const REPLAY_CANVAS_WIDTH = 1080;
export const REPLAY_CANVAS_HEIGHT = 1920;

interface RenderReplaySlideOptions {
  slide: ReplaySlide;
  snapshot: ReplaySnapshot;
  templateId: ReplayTemplateId;
  config: ReplaySlideConfig;
  lang: Lang;
  watermark: boolean;
}

interface ReplayPalette {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
}

function paletteFor(templateId: ReplayTemplateId): ReplayPalette {
  if (templateId === "film") {
    return {
      background: "#101114",
      surface: "#1b1d22",
      ink: "#f8f5ed",
      muted: "#a8a8ad",
      line: "#34363d",
    };
  }
  if (templateId === "scrapbook") {
    return {
      background: "#f3eadc",
      surface: "#fffaf1",
      ink: "#20201e",
      muted: "#706b62",
      line: "#d4c5b0",
    };
  }
  return {
    background: "#f3f8f6",
    surface: "#ffffff",
    ink: "#11151b",
    muted: "#68717a",
    line: "#dbe5e1",
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fontFamily(config: ReplaySlideConfig) {
  return config.fontStyle === "editorial"
    ? 'Georgia, "Times New Roman", serif'
    : '"Nunito Sans", "Avenir Next", Arial, sans-serif';
}

function setFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  weight: number,
  config: ReplaySlideConfig,
) {
  ctx.font = `${weight} ${size}px ${fontFamily(config)}`;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const paragraphs = text.split("\n");
  const lines: string[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    if (paragraphIndex < paragraphs.length - 1) lines.push("");
  });
  return lines;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = Infinity,
) {
  const lines = wrapLines(ctx, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

async function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("replay_image_load_failed"));
    image.src = url;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function drawPaperTexture(
  ctx: CanvasRenderingContext2D,
  templateId: ReplayTemplateId,
  palette: ReplayPalette,
) {
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, REPLAY_CANVAS_WIDTH, REPLAY_CANVAS_HEIGHT);
  ctx.save();
  ctx.globalAlpha = templateId === "film" ? 0.11 : 0.18;
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  const spacing = templateId === "scrapbook" ? 52 : 68;
  for (let y = 0; y < REPLAY_CANVAS_HEIGHT; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(REPLAY_CANVAS_WIDTH, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEyebrow(
  ctx: CanvasRenderingContext2D,
  text: string,
  config: ReplaySlideConfig,
  palette: ReplayPalette,
  y = 112,
) {
  setFont(ctx, 30, 800, config);
  ctx.fillStyle = config.accent;
  ctx.fillText(text, 72, y);
  ctx.fillStyle = palette.line;
  ctx.fillRect(72, y + 28, 936, 2);
}

function drawSlideNumber(
  ctx: CanvasRenderingContext2D,
  slide: ReplaySlide,
  config: ReplaySlideConfig,
  palette: ReplayPalette,
) {
  setFont(ctx, 26, 700, config);
  ctx.fillStyle = palette.muted;
  ctx.textAlign = "right";
  ctx.fillText(slide.kind.toUpperCase(), 1008, 1820);
  ctx.textAlign = "left";
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  config: ReplaySlideConfig,
  palette: ReplayPalette,
) {
  setFont(ctx, 24, 800, config);
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = 0.8;
  ctx.fillText("PINLY", 72, 1822);
  ctx.globalAlpha = 1;
}

async function drawCover(
  ctx: CanvasRenderingContext2D,
  options: RenderReplaySlideOptions,
  palette: ReplayPalette,
) {
  const { slide, snapshot, config } = options;
  if (slide.media?.url) {
    try {
      const image = await loadImage(slide.media.url);
      drawImageCover(ctx, image, 0, 0, REPLAY_CANVAS_WIDTH, 1090);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, REPLAY_CANVAS_WIDTH, 1090);
      setFont(ctx, 30, 800, config);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(slide.eyebrow, 72, 112);
    } catch {
      drawEyebrow(ctx, slide.eyebrow, config, palette);
    }
  } else {
    drawEyebrow(ctx, slide.eyebrow, config, palette);
  }

  ctx.fillStyle = palette.background;
  roundedRect(ctx, 0, 1016, REPLAY_CANVAS_WIDTH, 904, 52);
  ctx.fill();
  ctx.fillStyle = config.accent;
  ctx.fillRect(72, 1128, 94, 9);
  setFont(ctx, 76, 800, config);
  ctx.fillStyle = palette.ink;
  drawWrappedText(ctx, slide.title, 72, 1240, 900, 88, 4);
  setFont(ctx, 32, 600, config);
  ctx.fillStyle = palette.muted;
  drawWrappedText(ctx, slide.subtitle ?? "", 72, 1530, 900, 46, 3);
  setFont(ctx, 26, 700, config);
  ctx.fillStyle = palette.muted;
  ctx.fillText(
    `${snapshot.totals.memories} ${options.lang === "vi" ? "kỷ niệm" : "memories"}`,
    72,
    1712,
  );
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  options: RenderReplaySlideOptions,
  palette: ReplayPalette,
) {
  const { slide, snapshot, config } = options;
  drawEyebrow(ctx, slide.eyebrow, config, palette);
  setFont(ctx, 68, 800, config);
  ctx.fillStyle = palette.ink;
  drawWrappedText(ctx, slide.title, 72, 260, 900, 80, 3);
  setFont(ctx, 30, 600, config);
  ctx.fillStyle = palette.muted;
  ctx.fillText(slide.subtitle ?? "", 72, 470);

  const frame = { x: 72, y: 560, width: 936, height: 1020 };
  ctx.fillStyle = palette.surface;
  roundedRect(ctx, frame.x, frame.y, frame.width, frame.height, 30);
  ctx.fill();
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  const points = snapshot.route_points;
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const project = (lat: number, lng: number) => ({
    x:
      frame.x +
      100 +
      ((lng - minLng) / Math.max(maxLng - minLng, 0.01)) *
        (frame.width - 200),
    y:
      frame.y +
      100 +
      (1 - (lat - minLat) / Math.max(maxLat - minLat, 0.01)) *
        (frame.height - 200),
  });

  ctx.strokeStyle = config.accent;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    const projected = project(point.lat, point.lng);
    if (index === 0) ctx.moveTo(projected.x, projected.y);
    else ctx.lineTo(projected.x, projected.y);
  });
  ctx.stroke();

  points.forEach((point, index) => {
    const projected = project(point.lat, point.lng);
    ctx.fillStyle = index === 0 || index === points.length - 1
      ? config.accent
      : palette.surface;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, index === 0 ? 22 : 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = config.accent;
    ctx.lineWidth = 7;
    ctx.stroke();
  });
}

function statLabel(value: number, lang: Lang, suffix = "") {
  return `${formatLocalizedNumber(value, lang)}${suffix}`;
}

function drawStats(
  ctx: CanvasRenderingContext2D,
  options: RenderReplaySlideOptions,
  palette: ReplayPalette,
) {
  const { slide, snapshot, config, lang } = options;
  drawEyebrow(ctx, slide.eyebrow, config, palette);
  setFont(ctx, 66, 800, config);
  ctx.fillStyle = palette.ink;
  drawWrappedText(ctx, slide.title, 72, 260, 900, 78, 4);
  if (slide.subtitle) {
    setFont(ctx, 29, 600, config);
    ctx.fillStyle = palette.muted;
    drawWrappedText(ctx, slide.subtitle, 72, 560, 900, 42, 2);
  }
  const stats = [
    [snapshot.totals.memories, lang === "vi" ? "Kỷ niệm" : "Memories"],
    [snapshot.totals.cities, lang === "vi" ? "Thành phố" : "Cities"],
    [snapshot.totals.active_days, lang === "vi" ? "Ngày có dấu chân" : "Active days"],
    [
      statLabel(snapshot.totals.distance_km, lang, " km"),
      lang === "vi" ? "Đã đi qua" : "Travelled",
    ],
  ];
  stats.forEach(([value, label], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 72 + col * 480;
    const y = 760 + row * 380;
    ctx.fillStyle = palette.surface;
    roundedRect(ctx, x, y, 430, 310, 28);
    ctx.fill();
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    setFont(ctx, 66, 800, config);
    ctx.fillStyle = index === 0 ? config.accent : palette.ink;
    ctx.fillText(String(value), x + 42, y + 128);
    setFont(ctx, 28, 700, config);
    ctx.fillStyle = palette.muted;
    ctx.fillText(String(label), x + 42, y + 218);
  });
}

async function drawHighlight(
  ctx: CanvasRenderingContext2D,
  options: RenderReplaySlideOptions,
  palette: ReplayPalette,
) {
  const { slide, config, lang } = options;
  drawEyebrow(ctx, slide.eyebrow, config, palette);
  if (slide.media?.url) {
    try {
      const image = await loadImage(slide.media.url);
      ctx.save();
      roundedRect(ctx, 72, 190, 936, 1050, 34);
      ctx.clip();
      drawImageCover(ctx, image, 72, 190, 936, 1050);
      ctx.restore();
    } catch {
      ctx.fillStyle = palette.surface;
      roundedRect(ctx, 72, 190, 936, 1050, 34);
      ctx.fill();
    }
  }
  setFont(ctx, 68, 800, config);
  ctx.fillStyle = palette.ink;
  drawWrappedText(ctx, slide.title, 72, 1360, 900, 80, 3);
  setFont(ctx, 30, 600, config);
  ctx.fillStyle = palette.muted;
  ctx.fillText(slide.subtitle ?? "", 72, 1600);
  if (slide.memory) {
    setFont(ctx, 26, 700, config);
    ctx.fillStyle = config.accent;
    const date = formatLocalizedDate(slide.memory.created_at, lang, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    ctx.fillText(date, 72, 1690);
  }
}

function drawMonths(
  ctx: CanvasRenderingContext2D,
  options: RenderReplaySlideOptions,
  palette: ReplayPalette,
) {
  const { slide, snapshot, config } = options;
  drawEyebrow(ctx, slide.eyebrow, config, palette);
  setFont(ctx, 64, 800, config);
  ctx.fillStyle = palette.ink;
  drawWrappedText(ctx, slide.title, 72, 260, 900, 76, 4);
  setFont(ctx, 29, 600, config);
  ctx.fillStyle = palette.muted;
  drawWrappedText(ctx, slide.subtitle ?? "", 72, 570, 900, 42, 2);

  const values = snapshot.month_activity;
  const max = Math.max(...values.map((value) => value.memory_count), 1);
  const chart = { x: 72, y: 760, width: 936, height: 720 };
  const gap = 16;
  const barWidth = (chart.width - gap * (values.length - 1)) / values.length;
  values.forEach((value, index) => {
    const height = Math.max(12, (value.memory_count / max) * chart.height);
    const x = chart.x + index * (barWidth + gap);
    const y = chart.y + chart.height - height;
    ctx.fillStyle = value.key === snapshot.top_month.key
      ? config.accent
      : palette.line;
    roundedRect(ctx, x, y, barWidth, height, Math.min(16, barWidth / 2));
    ctx.fill();
    if (values.length <= 14) {
      setFont(ctx, 20, 700, config);
      ctx.fillStyle = palette.muted;
      ctx.textAlign = "center";
      ctx.fillText(value.key.slice(5), x + barWidth / 2, chart.y + chart.height + 44);
    }
  });
  ctx.textAlign = "left";
}

function drawContributors(
  ctx: CanvasRenderingContext2D,
  options: RenderReplaySlideOptions,
  palette: ReplayPalette,
) {
  const { slide, snapshot, config, lang } = options;
  drawEyebrow(ctx, slide.eyebrow, config, palette);
  setFont(ctx, 66, 800, config);
  ctx.fillStyle = palette.ink;
  drawWrappedText(ctx, slide.title, 72, 260, 900, 78, 4);
  setFont(ctx, 29, 600, config);
  ctx.fillStyle = palette.muted;
  drawWrappedText(ctx, slide.subtitle ?? "", 72, 565, 900, 42, 2);

  snapshot.contributors.slice(0, 5).forEach((contributor, index) => {
    const y = 760 + index * 176;
    const max = Math.max(snapshot.totals.memories, 1);
    const progress = contributor.memory_count / max;
    ctx.fillStyle = palette.surface;
    roundedRect(ctx, 72, y, 936, 132, 26);
    ctx.fill();
    ctx.fillStyle = config.accent;
    roundedRect(ctx, 72, y, Math.max(132, 936 * progress), 132, 26);
    ctx.globalAlpha = 0.13;
    ctx.fill();
    ctx.globalAlpha = 1;
    setFont(ctx, 31, 800, config);
    ctx.fillStyle = palette.ink;
    ctx.fillText(contributor.display_name, 112, y + 60);
    setFont(ctx, 24, 700, config);
    ctx.fillStyle = palette.muted;
    ctx.fillText(
      `${contributor.memory_count} ${lang === "vi" ? "kỷ niệm" : "memories"}`,
      112,
      y + 100,
    );
  });
}

function drawClosing(
  ctx: CanvasRenderingContext2D,
  options: RenderReplaySlideOptions,
  palette: ReplayPalette,
) {
  const { slide, snapshot, config, lang } = options;
  ctx.fillStyle = config.accent;
  ctx.beginPath();
  ctx.arc(540, 570, 184, 0, Math.PI * 2);
  ctx.fill();
  setFont(ctx, 132, 800, config);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText("P", 540, 620);
  ctx.textAlign = "left";
  setFont(ctx, 30, 800, config);
  ctx.fillStyle = config.accent;
  ctx.textAlign = "center";
  ctx.fillText(slide.eyebrow, 540, 900);
  setFont(ctx, 72, 800, config);
  ctx.fillStyle = palette.ink;
  const lines = wrapLines(ctx, slide.title, 880).slice(0, 4);
  lines.forEach((line, index) => ctx.fillText(line, 540, 1035 + index * 84));
  setFont(ctx, 30, 600, config);
  ctx.fillStyle = palette.muted;
  const subtitleLines = wrapLines(ctx, slide.subtitle ?? "", 840).slice(0, 3);
  subtitleLines.forEach((line, index) =>
    ctx.fillText(line, 540, 1400 + index * 44),
  );
  setFont(ctx, 26, 700, config);
  ctx.fillText(
    `${replayRangeLabel(snapshot, lang)} · PINLY`,
    540,
    1660,
  );
  ctx.textAlign = "left";
}

export async function renderReplaySlideToCanvas(
  options: RenderReplaySlideOptions,
) {
  const canvas = document.createElement("canvas");
  canvas.width = REPLAY_CANVAS_WIDTH;
  canvas.height = REPLAY_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("replay_canvas_unavailable");
  const palette = paletteFor(options.templateId);
  drawPaperTexture(ctx, options.templateId, palette);

  switch (options.slide.kind) {
    case "cover":
      await drawCover(ctx, options, palette);
      break;
    case "route":
      drawRoute(ctx, options, palette);
      break;
    case "stats":
      drawStats(ctx, options, palette);
      break;
    case "highlight":
      await drawHighlight(ctx, options, palette);
      break;
    case "months":
      drawMonths(ctx, options, palette);
      break;
    case "contributors":
      drawContributors(ctx, options, palette);
      break;
    case "closing":
      drawClosing(ctx, options, palette);
      break;
  }

  if (options.watermark) drawWatermark(ctx, options.config, palette);
  else drawSlideNumber(ctx, options.slide, options.config, palette);
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("replay_export_failed"))),
      "image/png",
      1,
    );
  });
}

export async function createReplaySlideFile(
  options: RenderReplaySlideOptions,
) {
  const canvas = await renderReplaySlideToCanvas(options);
  const blob = await canvasBlob(canvas);
  const safeRange = options.snapshot.range.start.replaceAll("-", "");
  return new File([blob], `pinly-replay-${safeRange}-${options.slide.id}.png`, {
    type: "image/png",
  });
}

export function canNativeShareReplayFiles(files: File[]) {
  const nav = navigator as unknown as {
    share?: Navigator["share"];
    canShare?: Navigator["canShare"];
  };
  return Boolean(
    typeof nav.share === "function" &&
      (typeof nav.canShare !== "function" || nav.canShare({ files })),
  );
}

export async function shareReplayFiles(files: File[], title: string) {
  if (!canNativeShareReplayFiles(files)) return false;
  await navigator.share({ title, files });
  return true;
}

export function downloadReplayFile(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
