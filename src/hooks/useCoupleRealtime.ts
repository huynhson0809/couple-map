import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Pin } from '../types'

interface Args {
  coupleId: string | null | undefined
  onInsert?: (pin: Pin) => void
  onUpdate?: (pin: Pin) => void
  onDelete?: (id: string) => void
}

export function useCoupleRealtime({ coupleId, onInsert, onUpdate, onDelete }: Args) {
  useEffect(() => {
    if (!coupleId) return
    const channel = supabase
      .channel(`pins:${coupleId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pins', filter: `couple_id=eq.${coupleId}` },
        (payload) => onInsert?.(payload.new as Pin),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pins', filter: `couple_id=eq.${coupleId}` },
        (payload) => onUpdate?.(payload.new as Pin),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pins', filter: `couple_id=eq.${coupleId}` },
        (payload) => onDelete?.((payload.old as { id: string }).id),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [coupleId, onInsert, onUpdate, onDelete])
}
