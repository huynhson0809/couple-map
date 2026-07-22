import type { Lang } from "../../hooks/I18nContext";
import type {
  ReplayFontStyle,
  ReplayMedia,
  ReplaySlide,
  ReplaySlideConfig,
  ReplaySnapshot,
  ReplayTemplateDefinition,
} from "./types";

export const REPLAY_TEMPLATES: ReplayTemplateDefinition[] = [
  {
    id: "journey",
    name: "Journey Map",
    minimumPlan: "free",
    className: "journey",
  },
  {
    id: "scrapbook",
    name: "Scrapbook",
    minimumPlan: "plus",
    className: "scrapbook",
  },
  {
    id: "film",
    name: "Film Diary",
    minimumPlan: "pro",
    className: "film",
  },
];

export const REPLAY_ACCENTS = [
  "#ff5964",
  "#ff8a4c",
  "#23a88a",
  "#3977f6",
  "#8257e6",
] as const;

export const DEFAULT_REPLAY_CONFIG: ReplaySlideConfig = {
  hiddenSlideIds: [],
  order: [],
  photoOverrides: {},
  accent: REPLAY_ACCENTS[0],
  fontStyle: "soft",
};

function isFontStyle(value: unknown): value is ReplayFontStyle {
  return value === "soft" || value === "editorial";
}

export function normalizeReplayConfig(
  value: Partial<ReplaySlideConfig> | null | undefined,
): ReplaySlideConfig {
  return {
    hiddenSlideIds: Array.isArray(value?.hiddenSlideIds)
      ? value.hiddenSlideIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    order: Array.isArray(value?.order)
      ? value.order.filter((item): item is string => typeof item === "string")
      : [],
    photoOverrides:
      value?.photoOverrides && typeof value.photoOverrides === "object"
        ? { ...value.photoOverrides }
        : {},
    accent:
      typeof value?.accent === "string" && value.accent
        ? value.accent
        : DEFAULT_REPLAY_CONFIG.accent,
    fontStyle: isFontStyle(value?.fontStyle)
      ? value.fontStyle
      : DEFAULT_REPLAY_CONFIG.fontStyle,
  };
}

function displayDate(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function displayMonth(value: string | null, lang: Lang) {
  if (!value) return lang === "vi" ? "Chưa có" : "Not yet";
  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
}

export function replayRangeLabel(snapshot: ReplaySnapshot, lang: Lang) {
  const { start, end, preset } = snapshot.range;
  if (
    preset === "calendar_year" &&
    start.slice(0, 4) === end.slice(0, 4)
  ) {
    return start.slice(0, 4);
  }
  return `${displayDate(start, lang)} – ${displayDate(end, lang)}`;
}

function mediaById(snapshot: ReplaySnapshot, id: string | undefined) {
  if (!id) return undefined;
  return snapshot.media_library.find((media) => media.id === id);
}

function defaultMedia(memory: ReplaySnapshot["highlights"][number] | undefined) {
  return memory?.media[0];
}

export function buildReplaySlides(
  snapshot: ReplaySnapshot,
  rawConfig: Partial<ReplaySlideConfig> | null | undefined,
  lang: Lang,
) {
  const config = normalizeReplayConfig(rawConfig);
  const rangeLabel = replayRangeLabel(snapshot, lang);
  const isVi = lang === "vi";
  const base: ReplaySlide[] = [
    {
      id: "cover",
      kind: "cover",
      eyebrow: isVi ? "PINLY REPLAY" : "PINLY REPLAY",
      title: isVi
        ? `Những nơi đã thành kỷ niệm`
        : "The places that became memories",
      subtitle: `${snapshot.space.name} · ${rangeLabel}`,
      media:
        mediaById(snapshot, config.photoOverrides.cover) ??
        snapshot.media_library[0],
      required: true,
    },
  ];

  if (snapshot.route_points.length > 1) {
    base.push({
      id: "route",
      kind: "route",
      eyebrow: isVi ? "DẤU CHÂN" : "YOUR TRAIL",
      title: isVi ? "Một hành trình, nhiều điểm nhớ" : "One trail, many memories",
      subtitle: isVi
        ? `${snapshot.totals.cities} thành phố · ${snapshot.totals.distance_km.toLocaleString("vi-VN")} km`
        : `${snapshot.totals.cities} cities · ${snapshot.totals.distance_km.toLocaleString("en-US")} km`,
    });
  }

  base.push({
    id: "stats",
    kind: "stats",
    eyebrow: isVi ? "NHÌN LẠI" : "BY THE NUMBERS",
    title: isVi
      ? `${snapshot.totals.memories} lần bạn đã dừng lại để lưu giữ`
      : `${snapshot.totals.memories} moments you chose to keep`,
    subtitle: snapshot.top_place.name
      ? isVi
        ? `${snapshot.top_place.name} là nơi xuất hiện nhiều nhất`
        : `${snapshot.top_place.name} appeared most often`
      : undefined,
  });

  const highlightLimit = snapshot.variant === "short" ? 1 : 3;
  snapshot.highlights.slice(0, highlightLimit).forEach((memory, index) => {
    const slideId = `highlight-${memory.id}`;
    base.push({
      id: slideId,
      kind: "highlight",
      eyebrow: isVi ? `KHOẢNH KHẮC ${index + 1}` : `HIGHLIGHT ${index + 1}`,
      title: memory.title,
      subtitle:
        memory.city ??
        memory.address ??
        displayDate(memory.created_at.slice(0, 10), lang),
      memory,
      media:
        mediaById(snapshot, config.photoOverrides[slideId]) ??
        defaultMedia(memory),
    });
  });

  if (snapshot.variant === "full") {
    base.push({
      id: "months",
      kind: "months",
      eyebrow: isVi ? "NHỊP ĐIỆU" : "YOUR RHYTHM",
      title: isVi
        ? `${displayMonth(snapshot.top_month.key, lang)} là tháng rực rỡ nhất`
        : `${displayMonth(snapshot.top_month.key, lang)} was your brightest month`,
      subtitle: isVi
        ? `${snapshot.top_month.memory_count} kỷ niệm được lưu trong tháng này`
        : `${snapshot.top_month.memory_count} memories saved that month`,
    });
  }

  if (snapshot.contributors.length > 1) {
    base.push({
      id: "contributors",
      kind: "contributors",
      eyebrow: isVi ? "CÙNG NHAU" : "TOGETHER",
      title: isVi ? "Câu chuyện này có nhiều người viết" : "This story had more than one author",
      subtitle: isVi
        ? `${snapshot.contributors.length} người đã góp những mảnh ghép riêng`
        : `${snapshot.contributors.length} people added their own pieces`,
    });
  }

  base.push({
    id: "closing",
    kind: "closing",
    eyebrow: isVi ? "HẸN GẶP Ở CHẶNG TỚI" : "SEE YOU ON THE NEXT STOP",
    title: isVi ? "Cứ đi, Pinly sẽ giữ lại." : "Keep going. Pinly will remember.",
    subtitle: snapshot.variant === "short"
      ? isVi
        ? "Chỉ vài khoảnh khắc cũng đủ để bắt đầu một câu chuyện."
        : "A few moments are enough to begin a story."
      : `${snapshot.space.name} · ${rangeLabel}`,
    required: true,
  });

  const byId = new Map(base.map((slide) => [slide.id, slide]));
  const ordered = [
    ...config.order.map((id) => byId.get(id)).filter(Boolean),
    ...base.filter((slide) => !config.order.includes(slide.id)),
  ] as ReplaySlide[];

  return ordered.filter(
    (slide) => slide.required || !config.hiddenSlideIds.includes(slide.id),
  );
}

export function moveReplaySlide(
  config: ReplaySlideConfig,
  slideId: string,
  direction: -1 | 1,
  allSlides: ReplaySlide[],
) {
  const currentOrder = config.order.length
    ? [...config.order]
    : allSlides.map((slide) => slide.id);
  const index = currentOrder.indexOf(slideId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= currentOrder.length) {
    return config;
  }
  [currentOrder[index], currentOrder[nextIndex]] = [
    currentOrder[nextIndex],
    currentOrder[index],
  ];
  return { ...config, order: currentOrder };
}

export function replayMediaOptions(snapshot: ReplaySnapshot): ReplayMedia[] {
  const seen = new Set<string>();
  return snapshot.media_library.filter((media) => {
    if (!media.url || seen.has(media.id)) return false;
    seen.add(media.id);
    return true;
  });
}
