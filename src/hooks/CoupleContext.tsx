import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useCouple } from './useCouple'
import { useSpaceCtx } from './SpaceContext'
import { supabase } from '../lib/supabase'
import type { Couple, User } from '../types'

type CoupleHook = ReturnType<typeof useCouple>
type SpaceMember = ReturnType<typeof useSpaceCtx>['members'][number]

const CoupleCtx = createContext<CoupleHook | null>(null)

function spaceProfileToUser(profile: NonNullable<ReturnType<typeof useSpaceCtx>['profile']>): User {
  return {
    id: profile.id,
    email: profile.email,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    couple_id: profile.couple_id,
    first_couple_id: profile.first_couple_id,
    couple_locked_at: profile.couple_locked_at,
    created_at: profile.created_at,
  }
}

function spaceMemberToUser(member: SpaceMember): User | null {
  if (member.user) return spaceProfileToUser(member.user)
  if (!member.email) return null
  return {
    id: member.user_id,
    email: member.email,
    display_name: member.display_name ?? null,
    avatar_url: member.avatar_url ?? null,
    couple_id: null,
    first_couple_id: null,
    couple_locked_at: null,
    created_at: member.joined_at,
  }
}

export function CoupleProvider({
  userId,
  children,
}: {
  userId: string | undefined
  children: ReactNode
}) {
  const value = useCouple(userId)
  const space = useSpaceCtx()
  const { refresh } = value
  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  const activeSpace = space.activeSpace
  const spaceCouple = useMemo<Couple | null>(() => {
    if (!activeSpace) return null

    const activeMembers = space.members.filter(
      (member) => member.space_id === activeSpace.id && member.status === 'active',
    )
    const secondaryMember = activeMembers.find(
      (member) => member.user_id !== activeSpace.owner_id,
    )

    return {
      id: activeSpace.id,
      invite_code: activeSpace.invite_code ?? '',
      user_a: activeSpace.owner_id,
      user_b: secondaryMember?.user_id ?? null,
      anniversary_date: activeSpace.started_on,
      background_image_url: activeSpace.background_image_url,
      plan: activeSpace.plan,
      created_at: activeSpace.created_at,
    }
  }, [activeSpace, space.members])

  const adaptedValue = useMemo<CoupleHook>(() => {
    const profile = space.profile
      ? {
          ...spaceProfileToUser(space.profile),
          couple_id: space.profile.couple_id ?? activeSpace?.id ?? null,
        }
      : value.profile
    const partnerMember = activeSpace
      ? space.members.find(
          (member) =>
            member.space_id === activeSpace.id &&
            member.status === 'active' &&
            member.user_id !== userId,
        )
      : null
    const partner = activeSpace
      ? partnerMember
        ? spaceMemberToUser(partnerMember)
        : null
      : value.partner
    const couple = spaceCouple ?? value.couple
    const updateCouple: CoupleHook['updateCouple'] = async (patch) => {
      if (!spaceCouple || !activeSpace) {
        return value.updateCouple(patch)
      }

      const spacePatch: {
        started_on?: string | null
        background_image_url?: string | null
      } = {}

      if ('anniversary_date' in patch) {
        spacePatch.started_on = patch.anniversary_date ?? null
      }
      if ('background_image_url' in patch) {
        spacePatch.background_image_url = patch.background_image_url ?? null
      }

      if (Object.keys(spacePatch).length === 0) return spaceCouple

      const { data, error } = await supabase
        .from('spaces')
        .update(spacePatch)
        .eq('id', activeSpace.id)
        .select()
        .single()
      if (error) throw error
      await space.refresh({ silent: true, activeSpaceId: activeSpace.id })

      const updatedSpace = data as typeof activeSpace
      return {
        ...spaceCouple,
        anniversary_date: updatedSpace.started_on,
        background_image_url: updatedSpace.background_image_url,
        plan: updatedSpace.plan,
        created_at: updatedSpace.created_at,
      }
    }

    return {
      ...value,
      profile,
      couple,
      partner,
      updateCouple,
    }
  }, [activeSpace, space, spaceCouple, userId, value])

  const coupleId = adaptedValue.couple?.id
  const paired = !!activeSpace || !!adaptedValue.couple?.user_b

  useEffect(() => {
    if (!userId) return
    const ch = supabase
      .channel(`me:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
        () => refreshRef.current({ silent: true }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [userId])

  useEffect(() => {
    if (!coupleId) return
    const ch = supabase
      .channel(`couple:${coupleId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${coupleId}` },
        () => refreshRef.current({ silent: true }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [coupleId])

  useEffect(() => {
    if (!userId || paired) return
    const t = setInterval(() => refreshRef.current({ silent: true }), 5000)
    return () => clearInterval(t)
  }, [userId, paired])

  return <CoupleCtx.Provider value={adaptedValue}>{children}</CoupleCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCoupleCtx() {
  const v = useContext(CoupleCtx)
  if (!v) throw new Error('useCoupleCtx must be used within CoupleProvider')
  return v
}
