import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface NotificationPreferences {
  memory_added: boolean
  reactions: boolean
  comments: boolean
  streak_reminders: boolean
  streak_email_reminders: boolean
}

const DEFAULT_PREFS: NotificationPreferences = {
  memory_added: true,
  reactions: true,
  comments: true,
  streak_reminders: true,
  streak_email_reminders: false,
}

interface NotificationPreferenceSnapshot {
  userId: string
  prefs: NotificationPreferences
}

export function useNotificationPreferences(userId: string | undefined) {
  const [snapshot, setSnapshot] =
    useState<NotificationPreferenceSnapshot | null>(null)
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null)
  const [errorUserId, setErrorUserId] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchPrefs = useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (!userId) {
      setSnapshot(null)
      setLoadingUserId(null)
      setErrorUserId(null)
      return
    }

    const targetUserId = userId
    setLoadingUserId(targetUserId)
    setErrorUserId(null)
    const { data, error } = await supabase
      .from('notification_preferences')
      .select(
        'memory_added,reactions,comments,streak_reminders,streak_email_reminders',
      )
      .eq('user_id', targetUserId)
      .maybeSingle()

    if (requestId !== requestIdRef.current) return
    if (error) {
      console.error('Could not load notification preferences:', error)
      setErrorUserId(targetUserId)
      setLoadingUserId(null)
      return
    }

    if (data) {
      setSnapshot({
        userId: targetUserId,
        prefs: {
          ...DEFAULT_PREFS,
          ...(data as Partial<NotificationPreferences>),
        },
      })
    } else {
      const { error: createError } = await supabase
        .from('notification_preferences')
        .upsert(
          { user_id: targetUserId, ...DEFAULT_PREFS },
          { onConflict: 'user_id' },
        )
      if (requestId !== requestIdRef.current) return
      if (createError) {
        console.error('Could not create notification preferences:', createError)
        setErrorUserId(targetUserId)
        setLoadingUserId(null)
        return
      }
      setSnapshot({ userId: targetUserId, prefs: DEFAULT_PREFS })
    }
    setLoadingUserId(null)
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPrefs()
    }, 0)
    return () => {
      window.clearTimeout(timer)
      requestIdRef.current += 1
    }
  }, [fetchPrefs])

  const activePrefs =
    snapshot && snapshot.userId === userId ? snapshot.prefs : DEFAULT_PREFS
  const loading = Boolean(
    userId && (loadingUserId === userId || snapshot?.userId !== userId),
  )
  const hasError = errorUserId === userId

  const updatePrefs = useCallback(
    async (patch: Partial<NotificationPreferences>) => {
      if (!userId || snapshot?.userId !== userId) return false

      const requestId = ++requestIdRef.current
      const targetUserId = userId
      const previous = snapshot.prefs
      const next = { ...previous, ...patch }
      setSnapshot({ userId: targetUserId, prefs: next })
      setLoadingUserId(targetUserId)
      setErrorUserId(null)

      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          { user_id: targetUserId, ...next },
          { onConflict: 'user_id' },
        )

      if (requestId !== requestIdRef.current) return false
      if (error) {
        console.error('Could not save notification preferences:', error)
        setSnapshot({ userId: targetUserId, prefs: previous })
        setErrorUserId(targetUserId)
        setLoadingUserId(null)
        return false
      }

      setLoadingUserId(null)
      return true
    },
    [snapshot, userId],
  )

  return {
    prefs: activePrefs,
    loading,
    error: hasError,
    updatePrefs,
    refresh: fetchPrefs,
  }
}
