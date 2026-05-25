import { normalizeAddress, normalizeCityName, pickVietnamProvinceFromAddress, pickVietnamProvinceFromParts } from './locationNames'

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
      city: pickVietnamProvinceFromParts([
        context.region?.name,
        address,
        context.place?.name,
        context.locality?.name,
        context.district?.name,
      ]),
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

  let city: string | null = pickVietnamProvinceFromAddress(data.display_name)
  if (!city) {
    city =
      a.state ??
      a.province ??
      a.city ??
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
