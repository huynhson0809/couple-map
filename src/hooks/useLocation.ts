import { useState } from 'react'

export function useLocation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
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
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLoading(false)
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        },
        (err) => {
          setError(err.message)
          setLoading(false)
          reject(err)
        },
        { enableHighAccuracy: true, timeout: 10000 },
      )
    })
  }

  return { getCurrentPosition, loading, error }
}
