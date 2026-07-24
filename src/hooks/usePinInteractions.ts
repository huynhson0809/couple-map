import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from './I18nContext'
import type { PinComment, PinCommentReaction, PinReaction, ReactionType } from '../types'

function sendInteractionPush(
  eventType: 'reaction' | 'comment' | 'comment_reply' | 'comment_reaction',
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
  writable = true,
) {
  const { t } = useI18n()
  const [reactions, setReactions] = useState<PinReaction[]>([])
  const [comments, setComments] = useState<PinComment[]>([])
  const [commentReactions, setCommentReactions] = useState<PinCommentReaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const activePinIdRef = useRef(pinId)

  useEffect(() => {
    activePinIdRef.current = pinId
    requestIdRef.current += 1
  }, [pinId])

  const fetchInteractions = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!pinId) return
    const targetPinId = pinId
    const requestId = ++requestIdRef.current
    const silent = options.silent ?? false
    if (!silent) setLoading(true)
    setError(null)
    const [reactionRes, commentRes] = await Promise.all([
      supabase
        .from('pin_reactions')
        .select('*')
        .eq('pin_id', targetPinId),
      supabase
        .from('pin_comments')
        .select('*, author:users!pin_comments_user_id_fkey(*)')
        .eq('pin_id', targetPinId)
        .order('created_at', { ascending: true }),
    ])

    if (
      requestId !== requestIdRef.current ||
      activePinIdRef.current !== targetPinId
    ) return

    if (reactionRes.error || commentRes.error) {
      console.error('Failed to load pin interactions:', reactionRes.error ?? commentRes.error)
      setError(t('pin.interactionsLoadFailed'))
    } else {
      const nextComments = (commentRes.data as PinComment[]) ?? []
      let nextCommentReactions: PinCommentReaction[] = []
      if (nextComments.length > 0) {
        const { data: commentReactionData, error: commentReactionErr } = await supabase
          .from('pin_comment_reactions')
          .select('*')
          .in('comment_id', nextComments.map((comment) => comment.id))
        if (
          requestId !== requestIdRef.current ||
          activePinIdRef.current !== targetPinId
        ) return
        if (commentReactionErr) {
          console.error('Failed to load comment reactions:', commentReactionErr)
          setError(t('pin.interactionsLoadFailed'))
        } else {
          nextCommentReactions = (commentReactionData as PinCommentReaction[]) ?? []
        }
      }
      setReactions((reactionRes.data as PinReaction[]) ?? [])
      setComments(nextComments)
      setCommentReactions(nextCommentReactions)
    }
    if (!silent) setLoading(false)
  }, [pinId, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchInteractions()
    return () => {
      requestIdRef.current += 1
    }
  }, [fetchInteractions])

  useEffect(() => {
    if (!pinId) return
    const channel = supabase
      .channel(`pin-interactions:${pinId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pin_reactions', filter: `pin_id=eq.${pinId}` },
        () => void fetchInteractions({ silent: true }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pin_comments', filter: `pin_id=eq.${pinId}` },
        () => void fetchInteractions({ silent: true }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pin_comment_reactions' },
        () => void fetchInteractions({ silent: true }),
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
    if (!writable) throw new Error('space_read_only')
    const previousReactions = reactions
    if (myReaction === reaction) {
      setReactions((prev) => prev.filter((r) => r.user_id !== userId))
      const { error: deleteErr } = await supabase
        .from('pin_reactions')
        .delete()
        .eq('pin_id', pinId)
        .eq('user_id', userId)
      if (deleteErr) {
        setReactions(previousReactions)
        throw deleteErr
      }
      return
    }

    const row = { pin_id: pinId, user_id: userId, reaction }
    const optimisticRow: PinReaction = {
      ...row,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setReactions((prev) => [
      ...prev.filter((r) => r.user_id !== userId),
      optimisticRow,
    ])
    const { data, error: insertErr } = await supabase
      .from('pin_reactions')
      .upsert(row, { onConflict: 'pin_id,user_id' })
      .select()
      .single()
    if (insertErr) {
      setReactions(previousReactions)
      throw insertErr
    }
    setReactions((prev) => [...prev.filter((r) => r.user_id !== userId), data as PinReaction])
    sendInteractionPush('reaction', data as Record<string, unknown>)
  }, [myReaction, pinId, reactions, userId, writable])

  const addComment = useCallback(async (body: string, parentCommentId?: string | null) => {
    if (!userId) throw new Error('Not signed in')
    if (!writable) throw new Error('space_read_only')
    const trimmed = body.trim()
    if (!trimmed) return
    const { data, error: insertErr } = await supabase
      .from('pin_comments')
      .insert({ pin_id: pinId, user_id: userId, body: trimmed, parent_comment_id: parentCommentId ?? null })
      .select('*, author:users!pin_comments_user_id_fkey(*)')
      .single()
    if (insertErr) throw insertErr
    setComments((prev) => [...prev, data as PinComment])
    sendInteractionPush(parentCommentId ? 'comment_reply' : 'comment', {
      id: (data as PinComment).id,
      pin_id: pinId,
      user_id: userId,
      parent_comment_id: parentCommentId ?? null,
      body: trimmed,
    })
  }, [pinId, userId, writable])

  const deleteComment = useCallback(async (id: string) => {
    if (!writable) throw new Error('space_read_only')
    const { error: deleteErr } = await supabase.from('pin_comments').delete().eq('id', id)
    if (deleteErr) throw deleteErr
    setComments((prev) => prev.filter((c) => c.id !== id))
  }, [writable])

  const updateComment = useCallback(async (id: string, body: string) => {
    if (!writable) throw new Error('space_read_only')
    const trimmed = body.trim()
    if (!trimmed) return
    const { data, error: updateErr } = await supabase
      .from('pin_comments')
      .update({ body: trimmed })
      .eq('id', id)
      .select('*, author:users!pin_comments_user_id_fkey(*)')
      .single()
    if (updateErr) throw updateErr
    setComments((prev) => prev.map((c) => (c.id === id ? (data as PinComment) : c)))
  }, [writable])

  const setCommentReaction = useCallback(async (commentId: string, reaction: ReactionType = 'love') => {
    if (!userId) throw new Error('Not signed in')
    if (!writable) throw new Error('space_read_only')
    const current = commentReactions.find((item) => item.comment_id === commentId && item.user_id === userId)
    if (current?.reaction === reaction) {
      const { error: deleteErr } = await supabase
        .from('pin_comment_reactions')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId)
      if (deleteErr) throw deleteErr
      setCommentReactions((prev) =>
        prev.filter((item) => !(item.comment_id === commentId && item.user_id === userId)),
      )
      return
    }

    const row = { comment_id: commentId, user_id: userId, reaction }
    const { data, error: upsertErr } = await supabase
      .from('pin_comment_reactions')
      .upsert(row, { onConflict: 'comment_id,user_id' })
      .select()
      .single()
    if (upsertErr) throw upsertErr
    setCommentReactions((prev) => [
      ...prev.filter((item) => !(item.comment_id === commentId && item.user_id === userId)),
      data as PinCommentReaction,
    ])
    sendInteractionPush('comment_reaction', data as Record<string, unknown>)
  }, [commentReactions, userId, writable])

  return {
    reactions,
    reactionCount: reactions.length,
    hasReacted,
    myReaction,
    comments,
    commentReactions,
    loading,
    error,
    fetchInteractions,
    setReaction,
    addComment,
    updateComment,
    deleteComment,
    setCommentReaction,
  }
}
