import { normalizeAddress, normalizeCityName } from './locationNames'

export interface GeocodingResult {
  address: string
  city: string | null
  country: string | null
}

interface MapboxFeature {
  properties?: {
    name?: string
    full_address?: string
    place_formatted?: string
    context?: Record<string, { name?: string }>
  }
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined

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

export async function reverseGeocode(lat: number, lng: number, language = 'vi'): Promise<GeocodingResult> {
  const locale = language || 'vi'
  if (MAPBOX_TOKEN) {
    const mapboxResult = await reverseGeocodeMapbox(lat, lng, locale)
    if (mapboxResult.address) return mapboxResult
  }

  return reverseGeocodeNominatim(lat, lng, locale)
}

async function reverseGeocodeMapbox(lat: number, lng: number, language: string): Promise<GeocodingResult> {
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      access_token: MAPBOX_TOKEN ?? '',
      language,
      limit: '1',
      types: 'address,street,place,locality,neighborhood',
    })
    const res = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${params.toString()}`)
    if (!res.ok) return { address: '', city: null, country: null }

    const data = await res.json()
    const feature: MapboxFeature | undefined = Array.isArray(data.features) ? data.features[0] : undefined
    const props = feature?.properties
    if (!props) return { address: '', city: null, country: null }

    const context = props.context ?? {}
    const address = normalizeAddress(props.full_address ?? [props.name, props.place_formatted].filter(Boolean).join(', '))

    return {
      address,
      city: normalizeCityName(context.place?.name ?? context.locality?.name ?? context.district?.name ?? context.region?.name),
      country: context.country?.name ?? null,
    }
  } catch {
    return { address: '', city: null, country: null }
  }
}

async function reverseGeocodeNominatim(lat: number, lng: number, language: string): Promise<GeocodingResult> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=${encodeURIComponent(language)}`,
    { headers: { 'Accept-Language': language } },
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
    address: normalizeAddress(data.display_name ?? ''),
    city: normalizeCityName(city),
    country: a.country ?? null,
  }
}
