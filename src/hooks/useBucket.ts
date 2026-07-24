import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BucketListItem } from '../types'

export function useBucket(
  spaceId: string | null | undefined,
  userId: string | undefined,
  statusFilter?: BucketListItem['status'],
  writable = true,
) {
  const [snapshot, setSnapshot] = useState<{
    spaceId: string | null
    items: BucketListItem[]
    loading: boolean
  }>({ spaceId: null, items: [], loading: false })
  const requestIdRef = useRef(0)
  const activeSpaceIdRef = useRef(spaceId)
  const items = snapshot.spaceId === spaceId ? snapshot.items : []
  const loading = snapshot.spaceId === spaceId ? snapshot.loading : Boolean(spaceId)

  useEffect(() => {
    activeSpaceIdRef.current = spaceId
  }, [spaceId])

  const fetchItems = useCallback(async () => {
    if (!spaceId) {
      requestIdRef.current += 1
      setSnapshot({ spaceId: null, items: [], loading: false })
      return
    }
    const targetSpaceId = spaceId
    const requestId = ++requestIdRef.current
    setSnapshot((current) => ({
      spaceId: targetSpaceId,
      items: current.spaceId === targetSpaceId ? current.items : [],
      loading: true,
    }))
    let query = supabase
      .from('bucket_list')
      .select('*')
      .eq('couple_id', targetSpaceId)

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })

    if (
      requestId !== requestIdRef.current ||
      activeSpaceIdRef.current !== targetSpaceId
    ) return
    if (error) console.error('Failed to load wishlist items:', error)
    setSnapshot({
      spaceId: targetSpaceId,
      items: error ? [] : (data as BucketListItem[]) ?? [],
      loading: false,
    })
  }, [spaceId, statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchItems()
    }, 0)
    return () => {
      window.clearTimeout(timer)
      requestIdRef.current += 1
    }
  }, [fetchItems])

  const addItem = useCallback(
    async (input: { title: string; lat: number; lng: number }) => {
      if (!spaceId || !userId) throw new Error('Not in a space')
      if (!writable) throw new Error('space_read_only')
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
      if (
        activeSpaceIdRef.current === spaceId &&
        (!statusFilter || row.status === statusFilter)
      ) {
        setSnapshot((current) => ({
          spaceId,
          items: [
            row,
            ...(current.spaceId === spaceId ? current.items : []),
          ],
          loading: false,
        }))
      }
      return row
    },
    [spaceId, statusFilter, userId, writable],
  )

  const removeItem = useCallback(async (id: string) => {
    if (!writable) throw new Error('space_read_only')
    const { error } = await supabase.from('bucket_list').delete().eq('id', id)
    if (error) throw error
    if (activeSpaceIdRef.current !== spaceId) return
    setSnapshot((current) => ({
      ...current,
      items: current.spaceId === spaceId
        ? current.items.filter((item) => item.id !== id)
        : current.items,
    }))
  }, [spaceId, writable])

  const setItemStatus = useCallback(async (id: string, status: BucketListItem['status']) => {
    if (!writable) throw new Error('space_read_only')
    const { data, error } = await supabase
      .from('bucket_list')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const row = data as BucketListItem
    if (activeSpaceIdRef.current !== spaceId) return
    setSnapshot((current) => {
      if (current.spaceId !== spaceId) return current
      if (statusFilter && row.status !== statusFilter) {
        return {
          ...current,
          items: current.items.filter((item) => item.id !== id),
        }
      }
      const exists = current.items.some((item) => item.id === id)
      return {
        ...current,
        items: !exists
          ? statusFilter
            ? [row, ...current.items]
            : current.items
          : current.items.map((item) => (item.id === id ? row : item)),
      }
    })
  }, [spaceId, statusFilter, writable])

  const markDone = useCallback((id: string) => setItemStatus(id, 'done'), [setItemStatus])
  const markDream = useCallback((id: string) => setItemStatus(id, 'dream'), [setItemStatus])

  return { items, loading, fetchItems, addItem, removeItem, markDone, markDream }
}
