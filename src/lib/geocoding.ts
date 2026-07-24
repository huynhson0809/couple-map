import { resolveGeocodingLanguage } from './geocodingLocale'
import { normalizeAddress, normalizeCountryName, pickLocalityName } from './locationNames'

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
    context?: Record<string, { name?: string; country_code?: string }>
  }
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined

export async function reverseGeocode(lat: number, lng: number, language?: string): Promise<GeocodingResult> {
  const locale = resolveGeocodingLanguage(language)
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
    const address = normalizeAddress(
      props.full_address ?? [props.name, props.place_formatted].filter(Boolean).join(', '),
      language,
    )
    const countryCode = context.country?.country_code
    const country = normalizeCountryName(context.country?.name, countryCode)

    return {
      address,
      city: pickLocalityName({
        address,
        country,
        countryCode,
        region: context.region?.name,
        place: context.place?.name,
        locality: context.locality?.name,
        district: context.district?.name,
      }),
      country,
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
  const country = normalizeCountryName(a.country, a.country_code)
  const city = pickLocalityName({
    address: data.display_name,
    country,
    countryCode: a.country_code,
    city: a.city,
    town: a.town,
    municipality: a.municipality,
    village: a.village,
    county: a.county,
    state: a.state,
    province: a.province,
    hamlet: a.hamlet,
  })

  return {
    address: normalizeAddress(data.display_name ?? '', language),
    city,
    country,
  }
}
