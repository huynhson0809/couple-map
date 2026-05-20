import { useState } from 'react'

export interface CurrentPosition {
  lat: number
  lng: number
  accuracy: number | null
}

export function useLocation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function getCurrentPosition(): Promise<CurrentPosition> {
    setLoading(true)
    setError(null)
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        const msg = 'Geolocation not supported'
        setError(msg)
        setLoading(false)
        reject(new Error(msg))
        return
      }
      let settled = false
      let best: GeolocationPosition | null = null
      let watchId: number | null = null
      let timer: number | null = null

      function finish(pos: GeolocationPosition) {
        if (settled) return
        settled = true
        if (watchId !== null) navigator.geolocation.clearWatch(watchId)
        if (timer !== null) window.clearTimeout(timer)
        setLoading(false)
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        })
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          best = pos
          if (pos.coords.accuracy <= 50) {
            finish(pos)
            return
          }

          watchId = navigator.geolocation.watchPosition(
            (next) => {
              if (!best || next.coords.accuracy < best.coords.accuracy) best = next
              if (next.coords.accuracy <= 30) finish(next)
            },
            () => {
              if (best) finish(best)
            },
            {
              enableHighAccuracy: true,
              maximumAge: 0,
              timeout: 8000,
            },
          )
          timer = window.setTimeout(() => {
            if (best) finish(best)
          }, 8000)
        },
        (err) => {
          setError(err.message)
          setLoading(false)
          reject(err)
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      )
    })
  }

  return { getCurrentPosition, loading, error }
}
