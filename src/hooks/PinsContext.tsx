import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePins } from './usePins'
import { useCoupleRealtime } from './useCoupleRealtime'
import { supabase } from '../lib/supabase'
import type { Pin } from '../types'

type PinsHook = ReturnType<typeof usePins>

interface Ctx extends PinsHook {
  latestPartnerPin: Pin | null
  clearLatestPartnerPin: () => void
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
  const value = usePins(coupleId, userId)
  const { fetchPins, setPins } = value
  const fetchRef = useRef(fetchPins)
  fetchRef.current = fetchPins
  const setPinsRef = useRef(setPins)
  setPinsRef.current = setPins
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  const [latestPartnerPin, setLatestPartnerPin] = useState<Pin | null>(null)
  const clearLatestPartnerPin = useCallback(() => setLatestPartnerPin(null), [])

  useCoupleRealtime({
    coupleId,
    onInsert: async (pin) => {
      fetchRef.current()
      if (pin.created_by && pin.created_by !== userIdRef.current) {
        // Fetch full pin with images for the toast/notification
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
    onUpdate: () => fetchRef.current(),
    onDelete: (id) => setPinsRef.current((prev) => prev.filter((p) => p.id !== id)),
  })

  // refresh once when coupleId becomes available
  useEffect(() => {
    if (coupleId) fetchRef.current()
  }, [coupleId])

  return (
    <PinsCtx.Provider value={{ ...value, latestPartnerPin, clearLatestPartnerPin }}>
      {children}
    </PinsCtx.Provider>
  )
}

export function usePinsCtx() {
  const v = useContext(PinsCtx)
  if (!v) throw new Error('usePinsCtx must be used within PinsProvider')
  return v
}
