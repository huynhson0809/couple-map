import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Couple, User } from '../types'

interface CoupleContextPayload {
  profile: User | null
  couple: Couple | null
  partner: User | null
}

async function fetchCoupleContextFallback(userId: string): Promise<CoupleContextPayload> {
  const { data: u, error: uErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (uErr) throw uErr

  const profile = (u as User) ?? null
  if (!profile?.couple_id) {
    return { profile, couple: null, partner: null }
  }

  const { data: c, error: cErr } = await supabase
    .from('couples')
    .select('*')
    .eq('id', profile.couple_id)
    .maybeSingle()
  if (cErr) throw cErr

  const couple = (c as Couple) ?? null
  if (!couple) {
    return { profile, couple: null, partner: null }
  }

  const partnerId = couple.user_a === userId ? couple.user_b : couple.user_a
  if (!partnerId) {
    return { profile, couple, partner: null }
  }

  const { data: p, error: pErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', partnerId)
    .maybeSingle()
  if (pErr) throw pErr

  return { profile, couple, partner: (p as User) ?? null }
}

export function useCouple(userId: string | undefined) {
  const [profile, setProfile] = useState<User | null>(null)
  const [couple, setCouple] = useState<Couple | null>(null)
  const [partner, setPartner] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!userId) {
      setProfile(null)
      setCouple(null)
      setPartner(null)
      setLoading(false)
      return
    }
    if (!opts?.silent) setLoading(true)
    setError(null)

    try {
      const { data, error: contextError } = await supabase.rpc('get_couple_context_for_current_user')
      const payload =
        contextError || !data
          ? await fetchCoupleContextFallback(userId)
          : (data as CoupleContextPayload)

      if (requestIdRef.current !== requestId) return
      setProfile(payload.profile ?? null)
      setCouple(payload.couple ?? null)
      setPartner(payload.partner ?? null)
    } catch (err) {
      if (requestIdRef.current === requestId) {
        setError(err instanceof Error ? err.message : 'Could not load couple')
        setProfile(null)
        setCouple(null)
        setPartner(null)
      }
    } finally {
      if (requestIdRef.current === requestId) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const createCouple = useCallback(async () => {
    if (!userId) throw new Error('Not signed in')
    const { data, error } = await supabase.rpc('create_couple_for_current_user')
    if (error) throw error
    await refresh()
    return data as Couple
  }, [userId, refresh])

  const joinCouple = useCallback(
    async (inviteCode: string) => {
      if (!userId) throw new Error('Not signed in')
      const code = inviteCode.trim().toUpperCase()
      const { data, error } = await supabase.rpc('join_couple_by_invite', { code })
      if (error) throw error
      await refresh()
      return data as Couple
    },
    [userId, refresh],
  )

  const updateCouple = useCallback(
    async (patch: Partial<Pick<Couple, 'anniversary_date'>> & { background_image_url?: string | null }) => {
      if (!couple) throw new Error('No couple')
      const { data, error } = await supabase
        .from('couples')
        .update(patch)
        .eq('id', couple.id)
        .select()
        .single()
      if (error) throw error
      setCouple(data as Couple)
      return data as Couple
    },
    [couple],
  )

  const breakupCouple = useCallback(async (confirmText: string) => {
    if (!userId) throw new Error('Not signed in')
    const normalized = confirmText.trim().toUpperCase()
    if (normalized !== 'KET THUC') {
      throw new Error('Invalid confirmation')
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('Not signed in')

    const { error: breakupError } = await supabase.functions.invoke('breakup-couple', {
      body: { confirmText: normalized },
      headers: { Authorization: `Bearer ${token}` },
    })

    if (breakupError) {
      const context = (breakupError as { context?: unknown }).context
      if (context instanceof Response) {
        const details = await context.json().catch(() => null)
        if (details?.error) {
          throw new Error(
            details.details ? `${details.error}: ${details.details}` : details.error,
          )
        }
      }
      throw new Error(breakupError.message)
    }

    await refresh({ silent: true })
  }, [refresh, userId])

  return { profile, couple, partner, loading, error, refresh, createCouple, joinCouple, updateCouple, breakupCouple }
}
