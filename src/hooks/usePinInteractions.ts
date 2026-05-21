import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PinComment, PinReaction, ReactionType } from '../types'

function sendInteractionPush(
  eventType: 'reaction' | 'comment',
  record: Record<string, unknown>,
) {
  supabase.functions.invoke('send-push', {
    body: {
      event_type: eventType,
      record,
    },
  }).then(({ error }) => {
    if (error) console.warn('send-push interaction failed:', error.message)
  })
}

export function usePinInteractions(
  pinId: string,
  userId: string | undefined,
) {
  const [reactions, setReactions] = useState<PinReaction[]>([])
  const [comments, setComments] = useState<PinComment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchInteractions = useCallback(async () => {
    if (!pinId) return
    setLoading(true)
    setError(null)
    const [reactionRes, commentRes] = await Promise.all([
      supabase
        .from('pin_reactions')
        .select('*')
        .eq('pin_id', pinId),
      supabase
        .from('pin_comments')
        .select('*, author:users(*)')
        .eq('pin_id', pinId)
        .order('created_at', { ascending: true }),
    ])

    if (reactionRes.error || commentRes.error) {
      setError(reactionRes.error?.message ?? commentRes.error?.message ?? 'Failed to load interactions')
    } else {
      setReactions((reactionRes.data as PinReaction[]) ?? [])
      setComments((commentRes.data as PinComment[]) ?? [])
    }
    setLoading(false)
  }, [pinId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchInteractions()
  }, [fetchInteractions])

  useEffect(() => {
    if (!pinId) return
    const channel = supabase
      .channel(`pin-interactions:${pinId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pin_reactions', filter: `pin_id=eq.${pinId}` },
        () => void fetchInteractions(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pin_comments', filter: `pin_id=eq.${pinId}` },
        () => void fetchInteractions(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [pinId, fetchInteractions])

  const hasReacted = useMemo(
    () => !!userId && reactions.some((r) => r.user_id === userId),
    [reactions, userId],
  )
  const myReaction = useMemo(
    () => reactions.find((r) => r.user_id === userId)?.reaction ?? null,
    [reactions, userId],
  )

  const setReaction = useCallback(async (reaction: ReactionType) => {
    if (!userId) throw new Error('Not signed in')
    if (myReaction === reaction) {
      const { error: deleteErr } = await supabase
        .from('pin_reactions')
        .delete()
        .eq('pin_id', pinId)
        .eq('user_id', userId)
      if (deleteErr) throw deleteErr
      setReactions((prev) => prev.filter((r) => r.user_id !== userId))
      return
    }

    const row = { pin_id: pinId, user_id: userId, reaction }
    const { data, error: insertErr } = await supabase
      .from('pin_reactions')
      .upsert(row, { onConflict: 'pin_id,user_id' })
      .select()
      .single()
    if (insertErr) throw insertErr
    setReactions((prev) => [...prev.filter((r) => r.user_id !== userId), data as PinReaction])
    sendInteractionPush('reaction', data as Record<string, unknown>)
  }, [myReaction, pinId, userId])

  const addComment = useCallback(async (body: string) => {
    if (!userId) throw new Error('Not signed in')
    const trimmed = body.trim()
    if (!trimmed) return
    const { data, error: insertErr } = await supabase
      .from('pin_comments')
      .insert({ pin_id: pinId, user_id: userId, body: trimmed })
      .select('*, author:users(*)')
      .single()
    if (insertErr) throw insertErr
    setComments((prev) => [...prev, data as PinComment])
    sendInteractionPush('comment', {
      pin_id: pinId,
      user_id: userId,
      body: trimmed,
    })
  }, [pinId, userId])

  const deleteComment = useCallback(async (id: string) => {
    const { error: deleteErr } = await supabase.from('pin_comments').delete().eq('id', id)
    if (deleteErr) throw deleteErr
    setComments((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const updateComment = useCallback(async (id: string, body: string) => {
    const trimmed = body.trim()
    if (!trimmed) return
    const { data, error: updateErr } = await supabase
      .from('pin_comments')
      .update({ body: trimmed })
      .eq('id', id)
      .select('*, author:users(*)')
      .single()
    if (updateErr) throw updateErr
    setComments((prev) => prev.map((c) => (c.id === id ? (data as PinComment) : c)))
  }, [])

  return {
    reactions,
    reactionCount: reactions.length,
    hasReacted,
    myReaction,
    comments,
    loading,
    error,
    fetchInteractions,
    setReaction,
    addComment,
    updateComment,
    deleteComment,
  }
}
