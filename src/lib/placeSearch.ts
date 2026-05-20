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
  }
}

interface SearchOptions {
  language?: string
  proximity?: {
    lat: number
    lng: number
  }
}

interface MapboxFeature {
  geometry?: {
    coordinates?: [number, number]
  }
  properties?: {
    name?: string
    full_address?: string
    place_formatted?: string
    context?: Record<string, { name?: string }>
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

  if (MAPBOX_TOKEN) {
    const mapboxResults = await searchMapbox(trimmed, options)
    if (mapboxResults.length > 0) return mapboxResults
  }

  return searchNominatim(trimmed, options.language)
}

async function searchMapbox(query: string, options: SearchOptions): Promise<PlaceSearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      access_token: MAPBOX_TOKEN ?? '',
      autocomplete: 'true',
      country: 'vn',
      language: options.language ?? 'vi',
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

      return [{
        display_name: displayName,
        lat: String(lat),
        lon: String(lng),
        source: 'mapbox' as const,
        address: {
          city: context.place?.name ?? context.locality?.name,
          state: context.region?.name,
          county: context.district?.name,
          town: context.locality?.name,
          village: context.neighborhood?.name,
          country: context.country?.name,
        },
      }]
    })
  } catch {
    return []
  }
}

async function searchNominatim(query: string, language = 'vi'): Promise<PlaceSearchResult[]> {
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

  let data = await search(query)
  if (data.length === 0 && !/vi[eệ]t nam|vietnam/i.test(query)) {
    data = await search(`${query}, Vietnam`)
  }

  return data.flatMap((result: NominatimResult) => {
    if (!result.display_name || !result.lat || !result.lon) return []
    return [{
      display_name: result.display_name,
      lat: result.lat,
      lon: result.lon,
      source: 'nominatim' as const,
      address: result.address,
    }]
  })
}
