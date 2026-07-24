import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CATEGORIES,
  fetchCustomCategories,
  getAllCategories,
  getCategory,
  removeCustomCategory,
  upsertCustomCategory,
  type Category,
} from '../lib/categories'
import { supabase } from '../lib/supabase'
import { useI18n } from './I18nContext'

interface Ctx {
  allCategories: Category[]
  customCategories: Category[]
  getCategory: (id: string | null | undefined) => Category | undefined
  saveCustomCategory: (cat: Category) => Promise<Category>
  deleteCustomCategory: (id: string) => Promise<void>
}

const CategoriesCtx = createContext<Ctx | null>(null)

export function CategoriesProvider({
  spaceId,
  userId,
  children,
}: {
  spaceId: string | null | undefined
  userId: string | undefined
  children: ReactNode
}) {
  const { lang } = useI18n()
  const [snapshot, setSnapshot] = useState<{
    spaceId: string | null
    categories: Category[]
  }>({ spaceId: null, categories: [] })
  const requestIdRef = useRef(0)
  const activeSpaceIdRef = useRef(spaceId)
  const customCategories = useMemo(
    () => snapshot.spaceId === spaceId ? snapshot.categories : [],
    [snapshot, spaceId],
  )

  const refresh = useCallback(async () => {
    if (!spaceId) {
      requestIdRef.current += 1
      setSnapshot({ spaceId: null, categories: [] })
      return
    }
    const targetSpaceId = spaceId
    const requestId = ++requestIdRef.current
    let rows: Category[]
    try {
      rows = await fetchCustomCategories(targetSpaceId)
    } catch (error) {
      if (
        requestId === requestIdRef.current &&
        activeSpaceIdRef.current === targetSpaceId
      ) {
        console.error('Could not load custom categories:', error)
      }
      return
    }
    if (
      requestId !== requestIdRef.current ||
      activeSpaceIdRef.current !== targetSpaceId
    ) return
    setSnapshot({ spaceId: targetSpaceId, categories: rows })
  }, [spaceId])

  useEffect(() => {
    activeSpaceIdRef.current = spaceId
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => {
      window.clearTimeout(timer)
      requestIdRef.current += 1
    }
  }, [refresh, spaceId])

  useEffect(() => {
    if (!spaceId) return
    const channel = supabase
      .channel(`custom-categories:${spaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'custom_categories',
          filter: `couple_id=eq.${spaceId}`,
        },
        () => void refresh(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [spaceId, refresh])

  const saveCustomCategory = useCallback(
    async (cat: Category) => {
      if (!spaceId || !userId) throw new Error('Missing space')
      const saved = await upsertCustomCategory(spaceId, userId, cat)
      if (activeSpaceIdRef.current !== spaceId) return saved
      setSnapshot((current) => {
        const categories = current.spaceId === spaceId ? current.categories : []
        const index = categories.findIndex((category) => category.id === saved.id)
        if (index < 0) {
          return { spaceId, categories: [...categories, saved] }
        }
        const next = [...categories]
        next[index] = saved
        return { spaceId, categories: next }
      })
      return saved
    },
    [spaceId, userId],
  )

  const deleteCustomCategory = useCallback(
    async (id: string) => {
      if (!spaceId) throw new Error('Missing space')
      await removeCustomCategory(spaceId, id)
      if (activeSpaceIdRef.current !== spaceId) return
      setSnapshot((current) => current.spaceId === spaceId
        ? {
            ...current,
            categories: current.categories.filter((category) => category.id !== id),
          }
        : current)
    },
    [spaceId],
  )

  const allCategories = useMemo(
    () => getAllCategories(customCategories, lang),
    [customCategories, lang],
  )
  const getCategoryById = useCallback(
    (id: string | null | undefined) => getCategory(id, customCategories, lang),
    [customCategories, lang],
  )

  return (
    <CategoriesCtx.Provider
      value={{
        allCategories,
        customCategories,
        getCategory: getCategoryById,
        saveCustomCategory,
        deleteCustomCategory,
      }}
    >
      {children}
    </CategoriesCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCategoriesCtx() {
  const v = useContext(CategoriesCtx)
  if (!v) {
    return {
      allCategories: CATEGORIES,
      customCategories: [],
      getCategory: (id: string | null | undefined) => getCategory(id),
      saveCustomCategory: async () => {
        throw new Error('CategoriesProvider is missing')
      },
      deleteCustomCategory: async () => {
        throw new Error('CategoriesProvider is missing')
      },
    } satisfies Ctx
  }
  return v
}
