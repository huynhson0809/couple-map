import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BucketListItem } from '../types'

export function useBucket(coupleId: string | null | undefined, userId: string | undefined) {
  const [items, setItems] = useState<BucketListItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchItems = useCallback(async () => {
    if (!coupleId) {
      setItems([])
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('bucket_list')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false })
    setItems((data as BucketListItem[]) ?? [])
    setLoading(false)
  }, [coupleId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchItems()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchItems])

  const addItem = useCallback(
    async (input: { title: string; lat: number; lng: number }) => {
      if (!coupleId || !userId) throw new Error('Not in a couple')
      const { data, error } = await supabase
        .from('bucket_list')
        .insert({
          couple_id: coupleId,
          created_by: userId,
          title: input.title,
          lat: input.lat,
          lng: input.lng,
          status: 'dream',
        })
        .select()
        .single()
      if (error) throw error
      setItems((prev) => [data as BucketListItem, ...prev])
      return data as BucketListItem
    },
    [coupleId, userId],
  )

  const removeItem = useCallback(async (id: string) => {
    const { error } = await supabase.from('bucket_list').delete().eq('id', id)
    if (error) throw error
    setItems((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const markDone = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('bucket_list')
      .update({ status: 'done' })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    setItems((prev) => prev.map((b) => (b.id === id ? (data as BucketListItem) : b)))
  }, [])

  return { items, loading, fetchItems, addItem, removeItem, markDone }
}
