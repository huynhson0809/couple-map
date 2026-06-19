import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
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
) {
  const [reactions, setReactions] = useState<PinReaction[]>([])
  const [comments, setComments] = useState<PinComment[]>([])
  const [commentReactions, setCommentReactions] = useState<PinCommentReaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchInteractions = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!pinId) return
    const silent = options.silent ?? false
    if (!silent) setLoading(true)
    setError(null)
    const [reactionRes, commentRes] = await Promise.all([
      supabase
        .from('pin_reactions')
        .select('*')
        .eq('pin_id', pinId),
      supabase
        .from('pin_comments')
        .select('*, author:users!pin_comments_user_id_fkey(*)')
        .eq('pin_id', pinId)
        .order('created_at', { ascending: true }),
    ])

    if (reactionRes.error || commentRes.error) {
      setError(reactionRes.error?.message ?? commentRes.error?.message ?? 'Failed to load interactions')
    } else {
      const nextComments = (commentRes.data as PinComment[]) ?? []
      setReactions((reactionRes.data as PinReaction[]) ?? [])
      setComments(nextComments)
      if (nextComments.length > 0) {
        const { data: commentReactionData, error: commentReactionErr } = await supabase
          .from('pin_comment_reactions')
          .select('*')
          .in('comment_id', nextComments.map((comment) => comment.id))
        if (commentReactionErr) {
          setError(commentReactionErr.message)
        } else {
          setCommentReactions((commentReactionData as PinCommentReaction[]) ?? [])
        }
      } else {
        setCommentReactions([])
      }
    }
    if (!silent) setLoading(false)
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
  }, [myReaction, pinId, reactions, userId])

  const addComment = useCallback(async (body: string, parentCommentId?: string | null) => {
    if (!userId) throw new Error('Not signed in')
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
      .select('*, author:users!pin_comments_user_id_fkey(*)')
      .single()
    if (updateErr) throw updateErr
    setComments((prev) => prev.map((c) => (c.id === id ? (data as PinComment) : c)))
  }, [])

  const setCommentReaction = useCallback(async (commentId: string, reaction: ReactionType = 'love') => {
    if (!userId) throw new Error('Not signed in')
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
  }, [commentReactions, userId])

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
