import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useCouple } from './useCouple'
import { supabase } from '../lib/supabase'

type CoupleHook = ReturnType<typeof useCouple>

const CoupleCtx = createContext<CoupleHook | null>(null)

export function CoupleProvider({
  userId,
  children,
}: {
  userId: string | undefined
  children: ReactNode
}) {
  const value = useCouple(userId)
  const { refresh } = value
  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  const coupleId = value.couple?.id
  const paired = !!value.couple?.user_b

  useEffect(() => {
    if (!userId) return
    const ch = supabase
      .channel(`me:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
        () => refreshRef.current({ silent: true }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [userId])

  useEffect(() => {
    if (!coupleId) return
    const ch = supabase
      .channel(`couple:${coupleId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${coupleId}` },
        () => refreshRef.current({ silent: true }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [coupleId])

  useEffect(() => {
    if (!userId || paired) return
    const t = setInterval(() => refreshRef.current({ silent: true }), 5000)
    return () => clearInterval(t)
  }, [userId, paired])

  return <CoupleCtx.Provider value={value}>{children}</CoupleCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCoupleCtx() {
  const v = useContext(CoupleCtx)
  if (!v) throw new Error('useCoupleCtx must be used within CoupleProvider')
  return v
}
