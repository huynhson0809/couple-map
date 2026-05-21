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
  coupleId,
  userId,
  children,
}: {
  coupleId: string | null | undefined
  userId: string | undefined
  children: ReactNode
}) {
  const [customCategories, setCustomCategories] = useState<Category[]>([])

  const refresh = useCallback(async () => {
    if (!coupleId) {
      setCustomCategories([])
      return
    }
    const rows = await fetchCustomCategories(coupleId)
    setCustomCategories(rows)
  }, [coupleId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!coupleId) return
    const channel = supabase
      .channel(`custom-categories:${coupleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'custom_categories',
          filter: `couple_id=eq.${coupleId}`,
        },
        () => void refresh(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, refresh])

  const saveCustomCategory = useCallback(
    async (cat: Category) => {
      if (!coupleId || !userId) throw new Error('Missing couple')
      const saved = await upsertCustomCategory(coupleId, userId, cat)
      setCustomCategories((prev) => {
        const idx = prev.findIndex((c) => c.id === saved.id)
        if (idx < 0) return [...prev, saved]
        const next = [...prev]
        next[idx] = saved
        return next
      })
      return saved
    },
    [coupleId, userId],
  )

  const deleteCustomCategory = useCallback(
    async (id: string) => {
      if (!coupleId) throw new Error('Missing couple')
      await removeCustomCategory(coupleId, id)
      setCustomCategories((prev) => prev.filter((c) => c.id !== id))
    },
    [coupleId],
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
