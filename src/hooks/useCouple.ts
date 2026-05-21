import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Couple, User } from '../types'

export function useCouple(userId: string | undefined) {
  const [profile, setProfile] = useState<User | null>(null)
  const [couple, setCouple] = useState<Couple | null>(null)
  const [partner, setPartner] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId) {
      setProfile(null)
      setCouple(null)
      setPartner(null)
      setLoading(false)
      return
    }
    if (!opts?.silent) setLoading(true)
    setError(null)
    const { data: u, error: uErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (uErr) setError(uErr.message)
    setProfile((u as User) ?? null)

    if (u?.couple_id) {
      const { data: c } = await supabase
        .from('couples')
        .select('*')
        .eq('id', u.couple_id)
        .maybeSingle()
      setCouple((c as Couple) ?? null)
      if (c) {
        const partnerId = c.user_a === userId ? c.user_b : c.user_a
        if (partnerId) {
          const { data: p } = await supabase
            .from('users')
            .select('*')
            .eq('id', partnerId)
            .maybeSingle()
          setPartner((p as User) ?? null)
        } else {
          setPartner(null)
        }
      }
    } else {
      setCouple(null)
      setPartner(null)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const createCouple = useCallback(async () => {
    if (!userId) throw new Error('Not signed in')
    const { data, error } = await supabase
      .from('couples')
      .insert({ user_a: userId })
      .select()
      .single()
    if (error) throw error
    const { error: upErr } = await supabase
      .from('users')
      .update({ couple_id: data.id })
      .eq('id', userId)
    if (upErr) throw upErr
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

  return { profile, couple, partner, loading, error, refresh, createCouple, joinCouple, updateCouple }
}
