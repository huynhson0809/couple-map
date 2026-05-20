export interface Category {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

export const CATEGORIES: Category[] = [
  { id: "breakfast", label: "Ăn sáng", emoji: "🥐", color: "#f59e0b" },
  { id: "lunch", label: "Ăn trưa", emoji: "🍱", color: "#f97316" },
  { id: "dinner", label: "Ăn tối", emoji: "🍽️", color: "#ef4444" },
  { id: "bubble_tea", label: "Trà sữa", emoji: "🧋", color: "#a855f7" },
  { id: "cafe", label: "Cafe", emoji: "☕", color: "#92400e" },
  { id: "movie", label: "Xem phim", emoji: "🎬", color: "#6366f1" },
  { id: "date", label: "Hẹn hò", emoji: "💝", color: "#e11d48" },
  { id: "walk", label: "Đi dạo", emoji: "🚶", color: "#10b981" },
  { id: "boardgame", label: "Board game", emoji: "🎲", color: "#8b5cf6" },
  { id: "shopping", label: "Mua sắm", emoji: "🛍️", color: "#db2777" },
  { id: "event", label: "Sự kiện", emoji: "🎉", color: "#eab308" },
  { id: "travel", label: "Du lịch", emoji: "✈️", color: "#0ea5e9" },
];

const CUSTOM_CATEGORIES_KEY = "mapmate.custom-categories";

export function getCustomCategories(): Category[] {
  try {
    const stored = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveCustomCategory(cat: Category): void {
  const existing = getCustomCategories();
  const idx = existing.findIndex((c) => c.id === cat.id);
  if (idx >= 0) existing[idx] = cat;
  else existing.push(cat);
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(existing));
}

export function deleteCustomCategory(id: string): void {
  const existing = getCustomCategories().filter((c) => c.id !== id);
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(existing));
}

export function getAllCategories(): Category[] {
  return [...CATEGORIES, ...getCustomCategories()];
}

export function getCategory(
  id: string | null | undefined,
): Category | undefined {
  if (!id) return undefined;
  return getAllCategories().find((c) => c.id === id);
}
