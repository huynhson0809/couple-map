import { resolveGeocodingLanguage } from './geocodingLocale'
import { normalizeAddress, normalizeCityName, normalizeCountryName, pickLocalityName } from './locationNames'

export interface PlaceSearchResult {
  display_name: string
  lat: string
  lon: string
  source: 'mapbox' | 'nominatim'
  address?: {
    city?: string
    state?: string
    province?: string
    county?: string
    town?: string
    village?: string
    country?: string
    country_code?: string
  }
}

interface SearchOptions {
  language?: string
  proximity?: {
    lat: number
    lng: number
  }
}

type LocalizedSearchOptions = SearchOptions & { language: string }

interface MapboxFeature {
  geometry?: {
    coordinates?: [number, number]
  }
  properties?: {
    name?: string
    full_address?: string
    place_formatted?: string
    context?: Record<string, { name?: string; country_code?: string }>
  }
}

interface NominatimResult {
  display_name?: string
  lat?: string
  lon?: string
  address?: PlaceSearchResult['address']
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined

export async function searchPlaces(query: string, options: SearchOptions = {}): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []
  const language = resolveGeocodingLanguage(options.language)
  const localizedOptions = { ...options, language }

  if (MAPBOX_TOKEN) {
    const mapboxResults = await searchMapbox(trimmed, localizedOptions)
    if (mapboxResults.length > 0) return mapboxResults
  }

  return searchNominatim(trimmed, language)
}

async function searchMapbox(query: string, options: LocalizedSearchOptions): Promise<PlaceSearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      access_token: MAPBOX_TOKEN ?? '',
      autocomplete: 'true',
      language: options.language,
      limit: '8',
      types: 'address,street,place,locality,neighborhood',
    })

    if (options.proximity) {
      params.set('proximity', `${options.proximity.lng},${options.proximity.lat}`)
    }

    const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`)
    if (!res.ok) return []
    const data = await res.json()
    const features = Array.isArray(data.features) ? data.features : []

    return features.flatMap((feature: MapboxFeature) => {
      const coordinates = feature.geometry?.coordinates
      if (!coordinates) return []

      const [lng, lat] = coordinates
      const props = feature.properties ?? {}
      const context = props.context ?? {}
      const displayName = props.full_address ?? [props.name, props.place_formatted].filter(Boolean).join(', ')
      if (!displayName) return []
      const normalizedDisplayName = normalizeAddress(displayName, options.language)
      const countryCode = context.country?.country_code
      const country = normalizeCountryName(context.country?.name, countryCode)
      const city = pickLocalityName({
        address: normalizedDisplayName,
        country,
        countryCode,
        region: context.region?.name,
        place: context.place?.name,
        locality: context.locality?.name,
        district: context.district?.name,
      })

      return [{
        display_name: normalizedDisplayName,
        lat: String(lat),
        lon: String(lng),
        source: 'mapbox' as const,
        address: {
          city: city ?? undefined,
          state: context.region?.name,
          county: context.district?.name,
          town: context.locality?.name,
          village: context.neighborhood?.name,
          country: country ?? undefined,
          country_code: countryCode,
        },
      }]
    })
  } catch {
    return []
  }
}

async function searchNominatim(query: string, language: string): Promise<PlaceSearchResult[]> {
  const search = async (q: string) => {
    const params = new URLSearchParams({
      format: 'json',
      addressdetails: '1',
      dedupe: '1',
      limit: '8',
      'accept-language': language,
      q,
    })
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { 'Accept-Language': language },
    })
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }

  const data = await search(query)

  return data.flatMap((result: NominatimResult) => {
    if (!result.display_name || !result.lat || !result.lon) return []
    const countryCode = result.address?.country_code
    const country = normalizeCountryName(result.address?.country, countryCode)
    const city = pickLocalityName({
      address: result.display_name,
      country,
      countryCode,
      city: result.address?.city,
      town: result.address?.town,
      village: result.address?.village,
      county: result.address?.county,
      state: result.address?.state,
      province: result.address?.province,
    })
    return [{
      display_name: normalizeAddress(result.display_name, language),
      lat: result.lat,
      lon: result.lon,
      source: 'nominatim' as const,
      address: result.address
        ? {
            ...result.address,
            city: city ?? undefined,
            state: normalizeCityName(
              result.address.state,
              country,
              countryCode,
            ) ?? undefined,
            province: normalizeCityName(
              result.address.province,
              country,
              countryCode,
            ) ?? undefined,
            country: country ?? undefined,
            country_code: countryCode,
          }
        : undefined,
    }]
  })
}
