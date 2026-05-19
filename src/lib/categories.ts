export interface Category {
  id: string
  label: string
  emoji: string
  color: string
}

export const CATEGORIES: Category[] = [
  { id: 'dinner',     label: 'Ăn tối',     emoji: '🍽️', color: '#ef4444' },
  { id: 'lunch',      label: 'Ăn trưa',    emoji: '🍱', color: '#f97316' },
  { id: 'breakfast',  label: 'Ăn sáng',    emoji: '🥐', color: '#f59e0b' },
  { id: 'bubble_tea', label: 'Trà sữa',    emoji: '🧋', color: '#a855f7' },
  { id: 'cafe',       label: 'Cafe',       emoji: '☕', color: '#92400e' },
  { id: 'dessert',    label: 'Dessert',    emoji: '🍰', color: '#ec4899' },
  { id: 'travel',     label: 'Du lịch',    emoji: '✈️', color: '#0ea5e9' },
  { id: 'beach',      label: 'Đi biển',    emoji: '🏖️', color: '#06b6d4' },
  { id: 'movie',      label: 'Xem phim',   emoji: '🎬', color: '#6366f1' },
  { id: 'boardgame',  label: 'Board game', emoji: '🎲', color: '#8b5cf6' },
  { id: 'shopping',   label: 'Mua sắm',    emoji: '🛍️', color: '#db2777' },
  { id: 'event',      label: 'Sự kiện',    emoji: '🎉', color: '#eab308' },
  { id: 'date',       label: 'Hẹn hò',     emoji: '💝', color: '#e11d48' },
  { id: 'walk',       label: 'Đi dạo',     emoji: '🚶', color: '#10b981' },
  { id: 'other',      label: 'Khác',       emoji: '📍', color: '#6b7280' },
]

export function getCategory(id: string | null | undefined): Category | undefined {
  if (!id) return undefined
  return CATEGORIES.find((c) => c.id === id)
}
