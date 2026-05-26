import { useMemo } from 'react'
import type { Couple, Pin } from '../types'
import { normalizeCityName, normalizeCountryName } from '../lib/locationNames'

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function useStats(pins: Pin[], couple: Couple | null) {
  return useMemo(() => {
    const totalPins = pins.length
    const cities = new Set<string>()
    const countries = new Set<string>()
    pins.forEach((p) => {
      const city = normalizeCityName(p.city)
      if (city) cities.add(city)
      const country = normalizeCountryName(p.country)
      if (country) countries.add(country)
    })

    const sorted = [...pins].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const firstPin = sorted[0] ?? null
    const latestPin = sorted[sorted.length - 1] ?? null

    let farthestKm = 0
    let farthestPair: [Pin, Pin] | null = null
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        const d = haversineKm(pins[i], pins[j])
        if (d > farthestKm) {
          farthestKm = d
          farthestPair = [pins[i], pins[j]]
        }
      }
    }

    const startDate = couple?.anniversary_date
      ? new Date(couple.anniversary_date)
      : firstPin
        ? new Date(firstPin.created_at)
        : null
    const daysTogether = startDate
      // eslint-disable-next-line react-hooks/purity
      ? Math.floor((Date.now() - startDate.getTime()) / 86_400_000)
      : null

    return {
      totalPins,
      cities: cities.size,
      countries: countries.size,
      cityList: Array.from(cities),
      countryList: Array.from(countries),
      firstPin,
      latestPin,
      farthestKm: Math.round(farthestKm * 10) / 10,
      farthestPair,
      daysTogether,
    }
  }, [pins, couple])
}
