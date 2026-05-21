import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface NotificationPreferences {
  memory_added: boolean
  reactions: boolean
  comments: boolean
  streak_reminders: boolean
}

const DEFAULT_PREFS: NotificationPreferences = {
  memory_added: true,
  reactions: true,
  comments: true,
  streak_reminders: true,
}

export function useNotificationPreferences(userId: string | undefined) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(false)

  const fetchPrefs = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase
      .from('notification_preferences')
      .select('memory_added,reactions,comments,streak_reminders')
      .eq('user_id', userId)
      .maybeSingle()

    if (data) {
      setPrefs(data as NotificationPreferences)
    } else {
      await supabase
        .from('notification_preferences')
        .upsert({ user_id: userId, ...DEFAULT_PREFS }, { onConflict: 'user_id' })
      setPrefs(DEFAULT_PREFS)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPrefs()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchPrefs])

  const updatePrefs = useCallback(
    async (patch: Partial<NotificationPreferences>) => {
      if (!userId) return
      const next = { ...prefs, ...patch }
      setPrefs(next)
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: userId, ...next }, { onConflict: 'user_id' })
      if (error) {
        setPrefs(prefs)
        throw error
      }
    },
    [prefs, userId],
  )

  return { prefs, loading, updatePrefs, refresh: fetchPrefs }
}
