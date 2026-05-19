import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { usePins } from './usePins'
import { useCoupleRealtime } from './useCoupleRealtime'

type PinsHook = ReturnType<typeof usePins>

const PinsCtx = createContext<PinsHook | null>(null)

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

  useCoupleRealtime({
    coupleId,
    onInsert: () => fetchRef.current(),
    onUpdate: () => fetchRef.current(),
    onDelete: (id) => setPinsRef.current((prev) => prev.filter((p) => p.id !== id)),
  })

  // refresh once when coupleId becomes available
  useEffect(() => {
    if (coupleId) fetchRef.current()
  }, [coupleId])

  return <PinsCtx.Provider value={value}>{children}</PinsCtx.Provider>
}

export function usePinsCtx() {
  const v = useContext(PinsCtx)
  if (!v) throw new Error('usePinsCtx must be used within PinsProvider')
  return v
}
