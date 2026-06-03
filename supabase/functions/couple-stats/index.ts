// Supabase Edge Function: couple-stats
// Returns aggregate stats for a couple: totalPins, cities, countries, daysTogether, farthestKm
//
// Deploy: supabase functions deploy couple-stats

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

  // Get user's couple_id
  const { data: profile } = await supabase
    .from("users")
    .select("couple_id")
    .eq("id", user.id)
    .single();

  const coupleId = profile?.couple_id;
  if (!coupleId) return jsonResponse({ error: "No couple found" }, 404);

  // Get couple info for anniversary
  const { data: couple } = await supabase
    .from("couples")
    .select("anniversary_date")
    .eq("id", coupleId)
    .single();

  // Fetch minimal pin data: lat, lng, city, country, created_at
  const { data: pins, error: pinsError } = await supabase
    .from("pins")
    .select("lat, lng, city, country, created_at")
    .eq("couple_id", coupleId);

  if (pinsError) return jsonResponse({ error: pinsError.message }, 500);

  const totalPins = pins?.length ?? 0;

  // Cities & Countries
  const cities = new Set<string>();
  const countries = new Set<string>();
  if (pins) {
    for (const p of pins) {
      if (p.city) cities.add(p.city.trim());
      if (p.country) countries.add(p.country.trim());
    }
  }

  // Farthest pair (O(n^2) but server-side so it's fine)
  let farthestKm = 0;
  if (pins && pins.length >= 2) {
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        const d = haversineKm(pins[i].lat, pins[i].lng, pins[j].lat, pins[j].lng);
        if (d > farthestKm) farthestKm = d;
      }
    }
  }

  // Days together
  let daysTogether: number | null = null;
  if (couple?.anniversary_date) {
    daysTogether = Math.floor(
      (Date.now() - new Date(couple.anniversary_date).getTime()) / 86_400_000,
    );
  } else if (pins && pins.length > 0) {
    const sorted = pins
      .map((p) => new Date(p.created_at).getTime())
      .sort((a, b) => a - b);
    daysTogether = Math.floor((Date.now() - sorted[0]) / 86_400_000);
  }

  return jsonResponse({
    totalPins,
    cities: cities.size,
    countries: countries.size,
    cityList: Array.from(cities),
    countryList: Array.from(countries),
    farthestKm: Math.round(farthestKm * 10) / 10,
    daysTogether,
  });
});
