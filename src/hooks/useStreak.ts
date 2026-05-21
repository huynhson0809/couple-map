import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Couple, CoupleStreak, CoupleStreakDay } from '../types'

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh'

function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function useStreak(couple: Couple | null, userId: string | undefined) {
  const [streak, setStreak] = useState<CoupleStreak | null>(null)
  const [today, setToday] = useState<CoupleStreakDay | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const coupleId = couple?.id

  const fetchStreak = useCallback(async () => {
    if (!coupleId) {
      setStreak(null)
      setToday(null)
      return
    }

    setLoading(true)
    setError(null)

    const { data: streakData, error: streakError } = await supabase
      .from('couple_streaks')
      .select('*')
      .eq('couple_id', coupleId)
      .maybeSingle()

    if (streakError) {
      setError(streakError.message)
      setLoading(false)
      return
    }

    const nextStreak = (streakData as CoupleStreak | null) ?? null
    setStreak(nextStreak)

    const streakDate = dateInTimeZone(new Date(), nextStreak?.timezone ?? DEFAULT_TIMEZONE)
    const { data: dayData, error: dayError } = await supabase
      .from('couple_streak_days')
      .select('*')
      .eq('couple_id', coupleId)
      .eq('streak_date', streakDate)
      .maybeSingle()

    if (dayError) setError(dayError.message)
    setToday((dayData as CoupleStreakDay | null) ?? null)
    setLoading(false)
  }, [coupleId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchStreak()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchStreak])

  useEffect(() => {
    if (!coupleId) return
    const channel = supabase
      .channel(`streak:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'couple_streaks', filter: `couple_id=eq.${coupleId}` },
        () => void fetchStreak(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'couple_streak_days', filter: `couple_id=eq.${coupleId}` },
        () => void fetchStreak(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, fetchStreak])

  const state = useMemo(() => {
    const localToday = dateInTimeZone(new Date(), streak?.timezone ?? DEFAULT_TIMEZONE)
    const yesterday = addDaysIso(localToday, -1)
    const streakIsForToday = streak?.today_date === localToday
    const userSlot =
      userId && couple?.user_a === userId
        ? 'user_a'
        : userId && couple?.user_b === userId
          ? 'user_b'
          : null
    const partnerSlot = userSlot === 'user_a' ? 'user_b' : userSlot === 'user_b' ? 'user_a' : null

    const userAPosted = streakIsForToday
      ? streak?.today_user_a_posted ?? today?.user_a_posted ?? false
      : today?.user_a_posted ?? false
    const userBPosted = streakIsForToday
      ? streak?.today_user_b_posted ?? today?.user_b_posted ?? false
      : today?.user_b_posted ?? false
    const todayCompleted = streakIsForToday
      ? streak?.today_completed ?? today?.completed ?? false
      : today?.completed ?? false
    const youPosted = userSlot === 'user_a' ? userAPosted : userSlot === 'user_b' ? userBPosted : false
    const partnerPosted = partnerSlot === 'user_a' ? userAPosted : partnerSlot === 'user_b' ? userBPosted : false
    const savedCount = streak?.current_count ?? 0
    const hasOpenDayGrace = !todayCompleted && streak?.last_completed_date === yesterday
    const currentCount = todayCompleted && !streakIsForToday
      ? (streak?.last_completed_date === yesterday ? savedCount : 0) + 1
      : todayCompleted || streakIsForToday || hasOpenDayGrace
        ? savedCount
        : 0

    return {
      currentCount,
      bestCount: streak?.best_count ?? 0,
      todayDate: localToday,
      lastCompletedDate: streak?.last_completed_date ?? null,
      todayCompleted,
      youPosted,
      partnerPosted,
      userAPosted,
      userBPosted,
      needsAction: !todayCompleted,
      atRisk: !todayCompleted && currentCount > 0,
    }
  }, [couple?.user_a, couple?.user_b, streak, today, userId])

  return {
    streak,
    today,
    loading,
    error,
    refresh: fetchStreak,
    ...state,
  }
}
