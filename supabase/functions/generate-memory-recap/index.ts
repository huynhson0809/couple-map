// Supabase Edge Function: generate-memory-recap
// Builds a deterministic recap for an arbitrary inclusive date range.
// Deploy: supabase functions deploy generate-memory-recap

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  buildCorsHeaders,
  handleCorsPreflightIfNeeded,
} from "../_shared/cors.ts";
import { adminClient, requireAuthUser } from "../_shared/auth-user.ts";

type RecapPreset = "calendar_year" | "custom";

interface RecapRequest {
  space_id?: unknown;
  range_start?: unknown;
  range_end?: unknown;
  preset?: unknown;
  timezone_offset_minutes?: unknown;
  refresh?: unknown;
}

interface PinImageRow {
  id: string;
  cloudinary_url: string;
  width: number | null;
  height: number | null;
  sort_order: number | null;
}

interface PinRow {
  id: string;
  created_by: string;
  title: string;
  note: string | null;
  lat: number;
  lng: number;
  address: string | null;
  city: string | null;
  country: string | null;
  is_favorite: boolean;
  created_at: string;
  pin_images: PinImageRow[] | null;
  pin_reactions: Array<{ user_id: string }> | null;
  pin_comments: Array<{ id: string }> | null;
}

interface MemberProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

interface RankedPin extends PinRow {
  score: number;
  monthKey: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIMEZONE_OFFSET_MINUTES = 7 * 60;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_RANGE_DAYS = 730;

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

function dateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function dateBoundaryIso(
  value: string,
  timezoneOffsetMinutes: number,
  addDays = 0,
) {
  const { year, month, day } = dateParts(value);
  const utc =
    Date.UTC(year, month - 1, day + addDays) -
    timezoneOffsetMinutes * 60 * 1000;
  return new Date(utc).toISOString();
}

function inclusiveRangeDays(start: string, end: string) {
  const startParts = dateParts(start);
  const endParts = dateParts(end);
  const startMs = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endMs = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

function localDateKey(iso: string, timezoneOffsetMinutes: number) {
  const shifted = new Date(
    new Date(iso).getTime() + timezoneOffsetMinutes * 60 * 1000,
  );
  return shifted.toISOString().slice(0, 10);
}

function localMonthKey(iso: string, timezoneOffsetMinutes: number) {
  return localDateKey(iso, timezoneOffsetMinutes).slice(0, 7);
}

function monthKeysBetween(start: string, end: string) {
  const startParts = dateParts(start);
  const endParts = dateParts(end);
  const keys: string[] = [];
  let year = startParts.year;
  let month = startParts.month;
  while (
    year < endParts.year ||
    (year === endParts.year && month <= endParts.month)
  ) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

function cleanText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function haversineKm(a: PinRow, b: PinRow) {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const latA = (a.lat * Math.PI) / 180;
  const latB = (b.lat * Math.PI) / 180;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

function pinScore(pin: PinRow) {
  const imageCount = pin.pin_images?.length ?? 0;
  const reactionCount = pin.pin_reactions?.length ?? 0;
  const commentCount = pin.pin_comments?.length ?? 0;
  return (
    (pin.is_favorite ? 10 : 0) +
    (imageCount > 0 ? 8 : 0) +
    Math.min(imageCount, 3) +
    reactionCount * 3 +
    commentCount * 2 +
    (cleanText(pin.note) ? 1 : 0)
  );
}

function rankedPins(pins: PinRow[], timezoneOffsetMinutes: number) {
  return pins
    .map<RankedPin>((pin) => ({
      ...pin,
      score: pinScore(pin),
      monthKey: localMonthKey(pin.created_at, timezoneOffsetMinutes),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
}

function chooseHighlights(ranked: RankedPin[], limit = 8) {
  const selected: RankedPin[] = [];
  const selectedIds = new Set<string>();
  const monthCounts = new Map<string, number>();

  for (const pin of ranked) {
    const count = monthCounts.get(pin.monthKey) ?? 0;
    if (count >= 2) continue;
    selected.push(pin);
    selectedIds.add(pin.id);
    monthCounts.set(pin.monthKey, count + 1);
    if (selected.length === limit) break;
  }

  if (selected.length < limit) {
    for (const pin of ranked) {
      if (selectedIds.has(pin.id)) continue;
      selected.push(pin);
      if (selected.length === limit) break;
    }
  }

  return selected.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function mediaForPin(pin: PinRow) {
  return [...(pin.pin_images ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((image) => ({
      id: image.id,
      memory_id: pin.id,
      url: image.cloudinary_url,
      width: image.width,
      height: image.height,
      title: pin.title,
      created_at: pin.created_at,
      city: cleanText(pin.city) || null,
    }));
}

function pinSummary(pin: PinRow) {
  return {
    id: pin.id,
    title: pin.title,
    note: pin.note,
    created_at: pin.created_at,
    lat: pin.lat,
    lng: pin.lng,
    city: cleanText(pin.city) || null,
    country: cleanText(pin.country) || null,
    address: cleanText(pin.address) || null,
    is_favorite: pin.is_favorite,
    reaction_count: pin.pin_reactions?.length ?? 0,
    comment_count: pin.pin_comments?.length ?? 0,
    media: mediaForPin(pin),
  };
}

function placeLabel(pin: PinRow) {
  return cleanText(pin.city) || cleanText(pin.address) || cleanText(pin.country);
}

function buildSnapshot({
  pins,
  profiles,
  space,
  userId,
  rangeStart,
  rangeEnd,
  preset,
  timezoneOffsetMinutes,
}: {
  pins: PinRow[];
  profiles: MemberProfile[];
  space: { id: string; name: string; type: string };
  userId: string;
  rangeStart: string;
  rangeEnd: string;
  preset: RecapPreset;
  timezoneOffsetMinutes: number;
}) {
  const ranked = rankedPins(pins, timezoneOffsetMinutes);
  const highlights = chooseHighlights(ranked);
  const monthKeys = monthKeysBetween(rangeStart, rangeEnd);
  const monthCounts = new Map(monthKeys.map((key) => [key, 0]));
  const contributorCounts = new Map<string, number>();
  const placeCounts = new Map<string, number>();
  const activeDays = new Set<string>();
  const cities = new Set<string>();
  const countries = new Set<string>();
  let distanceKm = 0;

  pins.forEach((pin, index) => {
    const monthKey = localMonthKey(pin.created_at, timezoneOffsetMinutes);
    monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
    contributorCounts.set(
      pin.created_by,
      (contributorCounts.get(pin.created_by) ?? 0) + 1,
    );
    activeDays.add(localDateKey(pin.created_at, timezoneOffsetMinutes));
    const city = cleanText(pin.city);
    const country = cleanText(pin.country);
    if (city) cities.add(city);
    if (country) countries.add(country);
    const place = placeLabel(pin);
    if (place) placeCounts.set(place, (placeCounts.get(place) ?? 0) + 1);
    if (index > 0) distanceKm += haversineKm(pins[index - 1], pin);
  });

  const topMonth = [...monthCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0] ?? [null, 0];
  const topPlace = [...placeCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0] ?? [null, 0];

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const contributorIds = new Set([
    ...profiles.map((profile) => profile.id),
    ...contributorCounts.keys(),
  ]);
  const contributors = [...contributorIds]
    .map((id) => {
      const profile = profileById.get(id);
      return {
        user_id: id,
        display_name:
          cleanText(profile?.display_name) || cleanText(profile?.email) || "Member",
        avatar_url: profile?.avatar_url ?? null,
        memory_count: contributorCounts.get(id) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.memory_count - a.memory_count ||
        a.display_name.localeCompare(b.display_name),
    );

  const mediaLibrary = ranked.flatMap(mediaForPin).slice(0, 24);

  return {
    version: 1,
    generated_for_user_id: userId,
    space,
    range: {
      start: rangeStart,
      end: rangeEnd,
      preset,
      timezone_offset_minutes: timezoneOffsetMinutes,
    },
    variant: pins.length >= 5 ? "full" : "short",
    totals: {
      memories: pins.length,
      cities: cities.size,
      countries: countries.size,
      active_days: activeDays.size,
      distance_km: Math.round(distanceKm * 10) / 10,
      reactions: pins.reduce(
        (total, pin) => total + (pin.pin_reactions?.length ?? 0),
        0,
      ),
      comments: pins.reduce(
        (total, pin) => total + (pin.pin_comments?.length ?? 0),
        0,
      ),
    },
    top_month: { key: topMonth[0], memory_count: topMonth[1] },
    top_place: { name: topPlace[0], memory_count: topPlace[1] },
    month_activity: monthKeys.map((key) => ({
      key,
      memory_count: monthCounts.get(key) ?? 0,
    })),
    contributors,
    route_points: pins.map((pin) => ({
      id: pin.id,
      title: pin.title,
      created_at: pin.created_at,
      lat: pin.lat,
      lng: pin.lng,
      city: cleanText(pin.city) || null,
    })),
    highlights: highlights.map(pinSummary),
    media_library: mediaLibrary,
    first_memory: pins[0] ? pinSummary(pins[0]) : null,
    last_memory: pins.at(-1) ? pinSummary(pins.at(-1)!) : null,
  };
}

serve(async (req) => {
  const preflight = handleCorsPreflightIfNeeded(req);
  if (preflight) return preflight;
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  let auth;
  try {
    auth = await requireAuthUser(req);
  } catch {
    return jsonResponse(req, { error: "unauthorized" }, 401);
  }

  let body: RecapRequest;
  try {
    body = (await req.json()) as RecapRequest;
  } catch {
    return jsonResponse(req, { error: "invalid_json" }, 400);
  }

  const spaceId = typeof body.space_id === "string" ? body.space_id.trim() : "";
  const rangeStart = parseDate(body.range_start);
  const rangeEnd = parseDate(body.range_end);
  const preset: RecapPreset =
    body.preset === "calendar_year" ? "calendar_year" : "custom";
  const requestedOffset =
    typeof body.timezone_offset_minutes === "number"
      ? Math.trunc(body.timezone_offset_minutes)
      : DEFAULT_TIMEZONE_OFFSET_MINUTES;
  const timezoneOffsetMinutes = Math.max(-720, Math.min(840, requestedOffset));
  const refresh = body.refresh === true;

  if (!spaceId || !rangeStart || !rangeEnd) {
    return jsonResponse(req, { error: "invalid_range" }, 400);
  }

  const rangeDays = inclusiveRangeDays(rangeStart, rangeEnd);
  const configuredMax = Number(Deno.env.get("REPLAY_MAX_RANGE_DAYS"));
  const maxRangeDays =
    Number.isFinite(configuredMax) && configuredMax > 0
      ? configuredMax
      : DEFAULT_MAX_RANGE_DAYS;
  if (rangeDays < 1 || rangeDays > maxRangeDays) {
    return jsonResponse(
      req,
      { error: "range_out_of_bounds", max_range_days: maxRangeDays },
      400,
    );
  }

  const admin = adminClient();
  const { data: allowed, error: rateError } = await admin.rpc(
    "check_edge_rate_limit",
    {
      limit_key: `memory-recap:${auth.user.id}`,
      window_seconds: 60,
      max_requests: 20,
    },
  );
  if (rateError) {
    return jsonResponse(req, { error: "rate_limit_unavailable" }, 500);
  }
  if (allowed === false) {
    return jsonResponse(req, { error: "rate_limit_exceeded" }, 429);
  }

  const { data: membership, error: membershipError } = await admin
    .from("space_members")
    .select("space_id")
    .eq("space_id", spaceId)
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) {
    return jsonResponse(req, { error: "membership_check_failed" }, 500);
  }
  if (!membership) {
    return jsonResponse(req, { error: "space_not_found" }, 404);
  }

  const { data: existing, error: existingError } = await admin
    .from("memory_recaps")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("space_id", spaceId)
    .eq("range_start", rangeStart)
    .eq("range_end", rangeEnd)
    .maybeSingle();
  if (existingError) {
    return jsonResponse(req, { error: "recap_lookup_failed" }, 500);
  }

  const generatedAt = existing?.generated_at
    ? new Date(existing.generated_at).getTime()
    : 0;
  const freshDraft = Date.now() - generatedAt < CACHE_TTL_MS;
  if (
    existing &&
    (existing.status === "finalized" || (!refresh && freshDraft))
  ) {
    return jsonResponse(req, { recap: existing, cached: true });
  }

  const startIso = dateBoundaryIso(rangeStart, timezoneOffsetMinutes);
  const endExclusiveIso = dateBoundaryIso(
    rangeEnd,
    timezoneOffsetMinutes,
    1,
  );

  const [spaceResult, membersResult, pinsResult] = await Promise.all([
    admin.from("spaces").select("id,name,type").eq("id", spaceId).single(),
    admin
      .from("space_members")
      .select("user_id")
      .eq("space_id", spaceId)
      .eq("status", "active"),
    admin
      .from("pins")
      .select(
        "id,created_by,title,note,lat,lng,address,city,country,is_favorite,created_at,pin_images(id,cloudinary_url,width,height,sort_order),pin_reactions(user_id),pin_comments(id)",
      )
      .eq("space_id", spaceId)
      .gte("created_at", startIso)
      .lt("created_at", endExclusiveIso)
      .order("created_at", { ascending: true }),
  ]);

  if (spaceResult.error || membersResult.error || pinsResult.error) {
    console.error("generate-memory-recap query failed", {
      space: spaceResult.error,
      members: membersResult.error,
      pins: pinsResult.error,
    });
    return jsonResponse(req, { error: "recap_source_failed" }, 500);
  }

  const memberIds = (membersResult.data ?? []).map((row) => row.user_id);
  const profilesResult = memberIds.length
    ? await admin
        .from("users")
        .select("id,display_name,avatar_url,email")
        .in("id", memberIds)
    : { data: [], error: null };
  if (profilesResult.error) {
    return jsonResponse(req, { error: "profile_lookup_failed" }, 500);
  }

  const pins = (pinsResult.data ?? []) as unknown as PinRow[];
  const snapshot = buildSnapshot({
    pins,
    profiles: (profilesResult.data ?? []) as MemberProfile[],
    space: spaceResult.data,
    userId: auth.user.id,
    rangeStart,
    rangeEnd,
    preset,
    timezoneOffsetMinutes,
  });
  const finalized = new Date(endExclusiveIso).getTime() <= Date.now();
  const nowIso = new Date().toISOString();

  const { data: recap, error: saveError } = await admin
    .from("memory_recaps")
    .upsert(
      {
        id: existing?.id,
        user_id: auth.user.id,
        space_id: spaceId,
        range_start: rangeStart,
        range_end: rangeEnd,
        preset,
        status: finalized ? "finalized" : "draft",
        template_id: existing?.template_id ?? "journey",
        snapshot_json: snapshot,
        slide_config_json: existing?.slide_config_json ?? {},
        generated_at: nowIso,
        finalized_at: finalized ? existing?.finalized_at ?? nowIso : null,
      },
      { onConflict: "user_id,space_id,range_start,range_end" },
    )
    .select("*")
    .single();

  if (saveError) {
    console.error("generate-memory-recap save failed", saveError);
    return jsonResponse(req, { error: "recap_save_failed" }, 500);
  }

  return jsonResponse(req, { recap, cached: false });
});

