import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Couple } from '../types'

interface Stats {
  totalPins: number
  cities: number
  countries: number
  cityList: string[]
  countryList: string[]
  farthestKm: number
  daysTogether: number | null
}

/**
 * Calls the couple-stats Edge Function which computes
 * all stats server-side in a single request.
 */
export function useStatsApi(coupleId: string | null | undefined, _couple: Couple | null) {
  const [stats, setStats] = useState<Stats>({
    totalPins: 0,
    cities: 0,
    countries: 0,
    cityList: [],
    countryList: [],
    farthestKm: 0,
    daysTogether: null,
  })
  const [loading, setLoading] = useState(false)

  const fetchStats = useCallback(async () => {
    if (!coupleId) return
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase.functions.invoke('couple-stats', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!error && data) {
        setStats({
          totalPins: data.totalPins ?? 0,
          cities: data.cities ?? 0,
          countries: data.countries ?? 0,
          cityList: data.cityList ?? [],
          countryList: data.countryList ?? [],
          farthestKm: data.farthestKm ?? 0,
          daysTogether: data.daysTogether ?? null,
        })
      }
    } catch {
      // silently fail
    }
    setLoading(false)
  }, [coupleId])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  return { stats, loading, refetch: fetchStats }
}
