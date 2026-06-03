import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePins } from './usePins'
import { useViewportPins, type Viewport } from './useViewportPins'
import { useCoupleRealtime } from './useCoupleRealtime'
import { supabase } from '../lib/supabase'
import type { Pin, PinImage } from '../types'

type PinsHook = ReturnType<typeof usePins>

export type UploadingPinInfo = { progress: number }

interface Ctx extends PinsHook {
  latestPartnerPin: Pin | null
  clearLatestPartnerPin: () => void
  uploadingPins: Map<string, UploadingPinInfo>
  setUploadProgress: (pinId: string, progress: number) => void
  clearUploadProgress: (pinId: string) => void
  pinsVersion: number
  bumpPinsVersion: () => void
  onViewportChange: (viewport: Viewport) => void
  loadAllPins: () => Promise<void>
  allPinsLoaded: boolean
}

const PinsCtx = createContext<Ctx | null>(null)

export function PinsProvider({
  coupleId,
  userId,
  children,
}: {
  coupleId: string | null | undefined
  userId: string | undefined
  children: ReactNode
}) {
  const pinsHook = usePins(coupleId, userId)
  const viewport = useViewportPins(coupleId)
  const userIdRef = useRef(userId)

  // Images cache: stores fetched images keyed by pin ID
  const [imagesCache, setImagesCache] = useState<Record<string, PinImage[]>>({})

  // Override fetchPinImages to also update our cache
  const fetchPinImages = useCallback(async (pinId: string): Promise<PinImage[]> => {
    const images = await pinsHook.fetchPinImages(pinId)
    setImagesCache((prev) => ({ ...prev, [pinId]: images }))
    return images
  }, [pinsHook.fetchPinImages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Merge viewport pins with images cache
  const pins = viewport.pins.map((p) =>
    imagesCache[p.id] ? { ...p, images: imagesCache[p.id] } : p,
  )

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  const [latestPartnerPin, setLatestPartnerPin] = useState<Pin | null>(null)
  const clearLatestPartnerPin = useCallback(() => setLatestPartnerPin(null), [])

  const [uploadingPins, setUploadingPins] = useState<Map<string, UploadingPinInfo>>(() => new Map())
  const setUploadProgress = useCallback((pinId: string, progress: number) => {
    setUploadingPins((prev) => {
      const next = new Map(prev)
      next.set(pinId, { progress })
      return next
    })
  }, [])
  const clearUploadProgress = useCallback((pinId: string) => {
    setUploadingPins((prev) => {
      const next = new Map(prev)
      next.delete(pinId)
      return next
    })
  }, [])

  const [pinsVersion, setPinsVersion] = useState(0)
  const bumpPinsVersion = useCallback(() => setPinsVersion((v) => v + 1), [])

  useCoupleRealtime({
    coupleId,
    onInsert: async (pin) => {
      viewport.addPin(pin)
      if (pin.created_by && pin.created_by !== userIdRef.current) {
        try {
          const { data } = await supabase
            .from('pins')
            .select('*, images:pin_images(*)')
            .eq('id', pin.id)
            .maybeSingle()
          if (data) setLatestPartnerPin(data as Pin)
          else setLatestPartnerPin(pin)
        } catch {
          setLatestPartnerPin(pin)
        }
      }
    },
    onUpdate: async (pin) => {
      viewport.updatePinLocal(pin.id, pin)
    },
    onDelete: (id) => viewport.removePin(id),
  })

  // Wrap create/delete to also update viewport state
  const createPin = useCallback(async (...args: Parameters<typeof pinsHook.createPin>) => {
    const newPin = await pinsHook.createPin(...args)
    viewport.addPin(newPin)
    return newPin
  }, [pinsHook.createPin, viewport.addPin]) // eslint-disable-line react-hooks/exhaustive-deps

  const deletePin = useCallback(async (id: string) => {
    await pinsHook.deletePin(id)
    viewport.removePin(id)
  }, [pinsHook.deletePin, viewport.removePin]) // eslint-disable-line react-hooks/exhaustive-deps

  const updatePin = useCallback(async (...args: Parameters<typeof pinsHook.updatePin>) => {
    const updated = await pinsHook.updatePin(...args)
    viewport.updatePinLocal(updated.id, updated)
    return updated
  }, [pinsHook.updatePin, viewport.updatePinLocal]) // eslint-disable-line react-hooks/exhaustive-deps

  const value: Ctx = {
    ...pinsHook,
    pins,
    fetchPinImages,
    createPin,
    deletePin,
    updatePin,
    latestPartnerPin,
    clearLatestPartnerPin,
    uploadingPins,
    setUploadProgress,
    clearUploadProgress,
    pinsVersion,
    bumpPinsVersion,
    onViewportChange: viewport.onViewportChange,
    loadAllPins: viewport.loadAll,
    allPinsLoaded: viewport.allLoaded,
  }

  return (
    <PinsCtx.Provider value={value}>
      {children}
    </PinsCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePinsCtx() {
  const v = useContext(PinsCtx)
  if (!v) throw new Error('usePinsCtx must be used within PinsProvider')
  return v
}
