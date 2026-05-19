export interface GeocodingResult {
  address: string
  city: string | null
  country: string | null
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
    {
      headers: {
        'Accept-Language': 'en',
      },
    },
  )

  if (!res.ok) {
    return { address: '', city: null, country: null }
  }

  const data = await res.json()
  const a = data.address ?? {}
  return {
    address: data.display_name ?? '',
    city: a.city ?? a.town ?? a.village ?? a.hamlet ?? null,
    country: a.country ?? null,
  }
}
