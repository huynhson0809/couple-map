export interface GeocodingResult {
  address: string
  city: string | null
  country: string | null
}

// Detect a postal code segment (digits, optionally with letters/dashes)
function looksLikePostalCode(s: string): boolean {
  const t = s.trim()
  return /^[0-9][0-9A-Z\- ]{2,9}$/i.test(t)
}

/**
 * Pick the "major city" from Nominatim's display_name.
 *
 * Strategy: walk segments from the end (which is `Country`) backwards,
 * skip postal codes, take the next segment. For Vietnam this lands on
 * "Ho Chi Minh City" instead of sub-administrative units like "Thủ Đức".
 */
function pickMajorCityFromDisplayName(displayName: string | undefined): string | null {
  if (!displayName) return null
  const parts = displayName
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  // last segment is country — drop it
  const rest = parts.slice(0, -1)
  // walk backwards, skip postal codes
  for (let i = rest.length - 1; i >= 0; i--) {
    if (!looksLikePostalCode(rest[i])) return rest[i]
  }
  return null
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`,
    { headers: { 'Accept-Language': 'en' } },
  )

  if (!res.ok) {
    return { address: '', city: null, country: null }
  }

  const data = await res.json()
  const a = data.address ?? {}

  // Prefer broader admin levels for "city".
  // Order: parsed display_name → state (province-level city) → city → town → village → county
  let city: string | null = pickMajorCityFromDisplayName(data.display_name)
  if (!city) {
    city =
      a.city ??
      a.state ??
      a.province ??
      a.county ??
      a.town ??
      a.municipality ??
      a.village ??
      a.hamlet ??
      null
  }

  return {
    address: data.display_name ?? '',
    city,
    country: a.country ?? null,
  }
}
