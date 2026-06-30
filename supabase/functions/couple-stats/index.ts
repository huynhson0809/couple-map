// Supabase Edge Function: couple-stats
// Returns aggregate stats for a memory space: totalPins, cities, countries, daysTogether, farthestKm
//
// Deploy: supabase functions deploy couple-stats

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface CoordinatePoint {
  lat: number;
  lng: number;
}

interface StatsSummary {
  totalPins: number;
  cityList: string[];
  countryList: string[];
  firstPinAt: string | null;
}

interface StatsData {
  summary: StatsSummary;
  points: CoordinatePoint[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-pinly-space-id",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function fetchStatsSummaryFromRpc(
  supabase: ReturnType<typeof createClient>,
  spaceId: string,
): Promise<StatsSummary | null> {
  // The legacy get_couple_stats_summary RPC remains deployed for older clients;
  // active-space stats use the space-scoped summary below.
  const { data, error } = await supabase.rpc("get_space_stats_summary", {
    target_space_id: spaceId,
  });
  if (error || !data) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const summary = row as Record<string, unknown>;

  return {
    totalPins: Number(summary.total_pins ?? 0),
    cityList: normalizeTextArray(summary.city_list),
    countryList: normalizeTextArray(summary.country_list),
    firstPinAt:
      typeof summary.first_pin_at === "string" ? summary.first_pin_at : null,
  };
}

async function fetchStatsDataFallback(
  supabase: ReturnType<typeof createClient>,
  spaceId: string,
): Promise<StatsData> {
  const { data: pins, error: pinsError } = await supabase
    .from("pins")
    .select("lat, lng, city, country, created_at")
    .eq("space_id", spaceId);

  if (pinsError) throw pinsError;

  const cityList = new Set<string>();
  const countryList = new Set<string>();
  let firstPinAt: string | null = null;
  const points: CoordinatePoint[] = [];

  for (const pin of pins ?? []) {
    if (typeof pin.lat === "number" && typeof pin.lng === "number") {
      points.push({ lat: pin.lat, lng: pin.lng });
    }
    const city = typeof pin.city === "string" ? pin.city.trim() : "";
    const country = typeof pin.country === "string" ? pin.country.trim() : "";
    if (city) cityList.add(city);
    if (country) countryList.add(country);
    if (
      typeof pin.created_at === "string" &&
      (!firstPinAt || new Date(pin.created_at) < new Date(firstPinAt))
    ) {
      firstPinAt = pin.created_at;
    }
  }

  return {
    summary: {
      totalPins: pins?.length ?? 0,
      cityList: Array.from(cityList),
      countryList: Array.from(countryList),
      firstPinAt,
    },
    points,
  };
}

async function fetchStatsData(
  supabase: ReturnType<typeof createClient>,
  spaceId: string,
): Promise<StatsData> {
  const summary = await fetchStatsSummaryFromRpc(supabase, spaceId);
  if (!summary) return fetchStatsDataFallback(supabase, spaceId);

  const { data: points, error: pointsError } = await supabase
    .from("pins")
    .select("lat, lng")
    .eq("space_id", spaceId);
  if (pointsError) throw pointsError;

  return {
    summary,
    points: (points ?? [])
      .filter(
        (point): point is CoordinatePoint =>
          typeof point.lat === "number" && typeof point.lng === "number",
      )
      .map((point) => ({ lat: point.lat, lng: point.lng })),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, {
      Allow: "GET, OPTIONS",
    });
  }

  // Auth: get user from JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { data: allowed, error: rateError } = await supabase.rpc(
    "check_edge_rate_limit",
    {
      limit_key: `couple-stats:${user.id}`,
      window_seconds: 60,
      max_requests: 60,
    },
  );
  if (rateError) return jsonResponse({ error: "Rate limit unavailable" }, 500);
  if (allowed === false)
    return jsonResponse({ error: "Rate limit exceeded" }, 429);

  const spaceId = req.headers.get("X-Pinly-Space-Id")?.trim();
  if (!spaceId) return jsonResponse({ error: "No space found" }, 404);

  const { data: membership, error: membershipError } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) {
    return jsonResponse({ error: "Could not verify space access" }, 500);
  }
  if (!membership) return jsonResponse({ error: "Space not found" }, 404);

  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("started_on")
    .eq("id", spaceId)
    .single();

  if (spaceError) return jsonResponse({ error: "Could not load space" }, 500);

  let stats: StatsData;
  try {
    stats = await fetchStatsData(supabase, spaceId);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Could not load stats" },
      500,
    );
  }

  // Farthest pair (O(n^2) but server-side so it's fine)
  let farthestKm = 0;
  if (stats.points.length >= 2) {
    for (let i = 0; i < stats.points.length; i++) {
      for (let j = i + 1; j < stats.points.length; j++) {
        const d = haversineKm(
          stats.points[i].lat,
          stats.points[i].lng,
          stats.points[j].lat,
          stats.points[j].lng,
        );
        if (d > farthestKm) farthestKm = d;
      }
    }
  }

  // Days together
  let daysTogether: number | null = null;
  if (space?.started_on) {
    daysTogether = Math.floor(
      (Date.now() - new Date(space.started_on).getTime()) / 86_400_000,
    );
  } else if (stats.summary.firstPinAt) {
    daysTogether = Math.floor(
      (Date.now() - new Date(stats.summary.firstPinAt).getTime()) / 86_400_000,
    );
  }

  return jsonResponse(
    {
      totalPins: stats.summary.totalPins,
      cities: stats.summary.cityList.length,
      countries: stats.summary.countryList.length,
      cityList: stats.summary.cityList,
      countryList: stats.summary.countryList,
      farthestKm: Math.round(farthestKm * 10) / 10,
      daysTogether,
    },
    200,
    {
      "Cache-Control": "no-store",
      Vary: "Authorization, X-Pinly-Space-Id",
    },
  );
});
