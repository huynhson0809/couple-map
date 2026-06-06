import { useState } from 'react'

export interface CurrentPosition {
  lat: number
  lng: number
  accuracy: number | null
}

const CACHE_MS = 60_000
const LOCATION_WAIT_MS = 15_000
const GOOD_ACCURACY_METERS = 35
const FALLBACK_ACCURACY_METERS = 180

let cachedPosition: (CurrentPosition & { receivedAt: number }) | null = null

export function useLocation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function getCurrentPosition(): Promise<CurrentPosition> {
    if (isUsableCachedPosition(cachedPosition)) {
      return toCurrentPosition(cachedPosition)
    }

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
      let lastError: GeolocationPositionError | null = null
      let watchId: number | null = null
      let timerId: number | null = null

      function cleanup() {
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId)
          watchId = null
        }
        if (timerId !== null) {
          window.clearTimeout(timerId)
          timerId = null
        }
      }

      function finish(pos: GeolocationPosition) {
        if (settled) return
        settled = true
        cleanup()
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        }
        cachedPosition = { ...coords, receivedAt: Date.now() }
        setLoading(false)
        resolve(coords)
      }

      function finishWithCache() {
        if (cachedPosition) {
          settled = true
          cleanup()
          setLoading(false)
          resolve(toCurrentPosition(cachedPosition))
          return true
        }
        return false
      }

      function fail(err?: GeolocationPositionError) {
        if (settled) return
        if (finishWithCache()) return
        settled = true
        cleanup()
        const msg =
          err?.code === 2
            ? 'Không thể lấy vị trí hiện tại, thử lại sau vài giây.'
            : err?.message || 'Không thể lấy vị trí hiện tại.'
        setError(msg)
        setLoading(false)
        reject(new Error(msg))
      }

      function remember(pos: GeolocationPosition) {
        if (
          !best ||
          (Number.isFinite(pos.coords.accuracy) &&
            (!Number.isFinite(best.coords.accuracy) ||
              pos.coords.accuracy < best.coords.accuracy))
        ) {
          best = pos
        }

        const accuracy = Number.isFinite(pos.coords.accuracy)
          ? pos.coords.accuracy
          : Infinity
        if (accuracy <= GOOD_ACCURACY_METERS) finish(pos)
      }

      function finishBestOrFail() {
        if (settled) return
        if (best) {
          const accuracy = Number.isFinite(best.coords.accuracy)
            ? best.coords.accuracy
            : Infinity
          if (accuracy <= FALLBACK_ACCURACY_METERS || !cachedPosition) {
            finish(best)
            return
          }
        }
        fail(lastError ?? undefined)
      }

      const options: PositionOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: LOCATION_WAIT_MS,
      }

      navigator.geolocation.getCurrentPosition(
        remember,
        (err) => {
          lastError = err
          if (err.code === err.PERMISSION_DENIED) fail(err)
        },
        options,
      )

      watchId = navigator.geolocation.watchPosition(
        remember,
        (err) => {
          lastError = err
          if (err.code === err.PERMISSION_DENIED) fail(err)
        },
        options,
      )

      timerId = window.setTimeout(finishBestOrFail, LOCATION_WAIT_MS)
    })
  }

  return { getCurrentPosition, loading, error }
}

function toCurrentPosition(
  position: CurrentPosition | (CurrentPosition & { receivedAt: number }),
): CurrentPosition {
  return {
    lat: position.lat,
    lng: position.lng,
    accuracy: position.accuracy,
  }
}

function isUsableCachedPosition(
  position: (CurrentPosition & { receivedAt: number }) | null,
): position is CurrentPosition & { receivedAt: number } {
  if (!position) return false
  if (Date.now() - position.receivedAt >= CACHE_MS) return false
  return position.accuracy !== null && position.accuracy <= GOOD_ACCURACY_METERS
}
