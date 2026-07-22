export type ReplayTemplateId = "journey" | "scrapbook" | "film";
export type ReplayPreset = "calendar_year" | "custom";
export type ReplayVariant = "full" | "short";
export type ReplayFontStyle = "soft" | "editorial";

export interface ReplayMedia {
  id: string;
  memory_id: string;
  url: string;
  width: number | null;
  height: number | null;
  title: string;
  created_at: string;
  city: string | null;
}

export interface ReplayMemory {
  id: string;
  title: string;
  note: string | null;
  created_at: string;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  address: string | null;
  is_favorite: boolean;
  reaction_count: number;
  comment_count: number;
  media: ReplayMedia[];
}

export interface ReplaySnapshot {
  version: number;
  generated_for_user_id: string;
  space: {
    id: string;
    name: string;
    type: "personal" | "shared" | "group" | string;
  };
  range: {
    start: string;
    end: string;
    preset: ReplayPreset;
    timezone_offset_minutes: number;
  };
  variant: ReplayVariant;
  totals: {
    memories: number;
    cities: number;
    countries: number;
    active_days: number;
    distance_km: number;
    reactions: number;
    comments: number;
  };
  top_month: { key: string | null; memory_count: number };
  top_place: { name: string | null; memory_count: number };
  month_activity: Array<{ key: string; memory_count: number }>;
  contributors: Array<{
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    memory_count: number;
  }>;
  route_points: Array<{
    id: string;
    title: string;
    created_at: string;
    lat: number;
    lng: number;
    city: string | null;
  }>;
  highlights: ReplayMemory[];
  media_library: ReplayMedia[];
  first_memory: ReplayMemory | null;
  last_memory: ReplayMemory | null;
}

export interface ReplaySlideConfig {
  hiddenSlideIds: string[];
  order: string[];
  photoOverrides: Record<string, string>;
  accent: string;
  fontStyle: ReplayFontStyle;
}

export interface MemoryRecapRow {
  id: string;
  user_id: string;
  space_id: string;
  range_start: string;
  range_end: string;
  preset: ReplayPreset;
  status: "draft" | "finalized";
  template_id: ReplayTemplateId;
  snapshot_json: ReplaySnapshot;
  slide_config_json: Partial<ReplaySlideConfig> | null;
  generated_at: string;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ReplaySlideKind =
  | "cover"
  | "route"
  | "stats"
  | "highlight"
  | "months"
  | "contributors"
  | "closing";

export interface ReplaySlide {
  id: string;
  kind: ReplaySlideKind;
  eyebrow: string;
  title: string;
  subtitle?: string;
  memory?: ReplayMemory;
  media?: ReplayMedia;
  required?: boolean;
}

export interface ReplayTemplateDefinition {
  id: ReplayTemplateId;
  name: string;
  minimumPlan: "free" | "plus" | "pro";
  className: string;
}
