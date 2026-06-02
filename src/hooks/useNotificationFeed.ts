import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppNotification } from '../types'

const PAGE_SIZE = 30

export function useNotificationFeed(userId: string | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchNotifications = useCallback(async (reset = false) => {
    if (!userId) return
    setLoading(true)
    const from = reset ? 0 : notifications.length
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (!error && data) {
      const rows = data as AppNotification[]
      if (reset) {
        setNotifications(rows)
      } else {
        setNotifications((prev) => [...prev, ...rows])
      }
      setHasMore(rows.length === PAGE_SIZE)
    }
    setLoading(false)
  }, [userId, notifications.length])

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
    setUnreadCount(count ?? 0)
  }, [userId])

  const markAsRead = useCallback(async (id: string) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  }, [])

  const markAllAsRead = useCallback(async () => {
    if (!userId) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [userId])

  // Initial fetch + unread count
  useEffect(() => {
    if (!userId) return
    fetchNotifications(true)
    fetchUnreadCount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Realtime subscription
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as AppNotification
          setNotifications((prev) => [newNotif, ...prev])
          setUnreadCount((c) => c + 1)
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [userId])

  return {
    notifications,
    unreadCount,
    loading,
    hasMore,
    fetchMore: () => fetchNotifications(false),
    refresh: () => fetchNotifications(true),
    markAsRead,
    markAllAsRead,
  }
}
