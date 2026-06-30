import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BucketListItem } from '../types'

export function useBucket(
  spaceId: string | null | undefined,
  userId: string | undefined,
  statusFilter?: BucketListItem['status'],
) {
  const [items, setItems] = useState<BucketListItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchItems = useCallback(async () => {
    if (!spaceId) {
      setItems([])
      return
    }
    setLoading(true)
    let query = supabase
      .from('bucket_list')
      .select('*')
      .eq('couple_id', spaceId)

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data } = await query
      .order('created_at', { ascending: false })

    setItems((data as BucketListItem[]) ?? [])
    setLoading(false)
  }, [spaceId, statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchItems()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchItems])

  const addItem = useCallback(
    async (input: { title: string; lat: number; lng: number }) => {
      if (!spaceId || !userId) throw new Error('Not in a space')
      const { data, error } = await supabase
        .from('bucket_list')
        .insert({
          couple_id: spaceId,
          created_by: userId,
          title: input.title,
          lat: input.lat,
          lng: input.lng,
          status: 'dream',
        })
        .select()
        .single()
      if (error) throw error
      const row = data as BucketListItem
      if (!statusFilter || row.status === statusFilter) {
        setItems((prev) => [row, ...prev])
      }
      return row
    },
    [spaceId, statusFilter, userId],
  )

  const removeItem = useCallback(async (id: string) => {
    const { error } = await supabase.from('bucket_list').delete().eq('id', id)
    if (error) throw error
    setItems((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const setItemStatus = useCallback(async (id: string, status: BucketListItem['status']) => {
    const { data, error } = await supabase
      .from('bucket_list')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const row = data as BucketListItem
    setItems((prev) => {
      if (statusFilter && row.status !== statusFilter) {
        return prev.filter((b) => b.id !== id)
      }
      const exists = prev.some((b) => b.id === id)
      if (!exists) return statusFilter ? [row, ...prev] : prev
      return prev.map((b) => (b.id === id ? row : b))
    })
  }, [statusFilter])

  const markDone = useCallback((id: string) => setItemStatus(id, 'done'), [setItemStatus])
  const markDream = useCallback((id: string) => setItemStatus(id, 'dream'), [setItemStatus])

  return { items, loading, fetchItems, addItem, removeItem, markDone, markDream }
}
