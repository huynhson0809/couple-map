import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  const [customCategories, setCustomCategories] = useState<Category[]>([])

  const refresh = useCallback(async () => {
    if (!spaceId) {
      setCustomCategories([])
      return
    }
    const rows = await fetchCustomCategories(spaceId)
    setCustomCategories(rows)
  }, [spaceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

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
      setCustomCategories((prev) => {
        const idx = prev.findIndex((c) => c.id === saved.id)
        if (idx < 0) return [...prev, saved]
        const next = [...prev]
        next[idx] = saved
        return next
      })
      return saved
    },
    [spaceId, userId],
  )

  const deleteCustomCategory = useCallback(
    async (id: string) => {
      if (!spaceId) throw new Error('Missing space')
      await removeCustomCategory(spaceId, id)
      setCustomCategories((prev) => prev.filter((c) => c.id !== id))
    },
    [spaceId],
  )

  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories])
  const getCategoryById = useCallback(
    (id: string | null | undefined) => getCategory(id, customCategories),
    [customCategories],
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
