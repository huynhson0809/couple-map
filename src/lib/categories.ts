import { supabase } from "./supabase";

export interface Category {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

interface CustomCategoryRow {
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
  { id: "shopping", label: "Mua sắm", emoji: "🛍️", color: "#db2777" },
  { id: "travel", label: "Du lịch", emoji: "✈️", color: "#0ea5e9" },
];

export function isBuiltInCategory(id: string | null | undefined): boolean {
  return !!id && CATEGORIES.some((c) => c.id === id);
}

export function getAllCategories(
  customCategories: Category[] = [],
): Category[] {
  return [...CATEGORIES, ...customCategories];
}

export function getCategory(
  id: string | null | undefined,
  customCategories: Category[] = [],
): Category | undefined {
  if (!id) return undefined;
  return getAllCategories(customCategories).find((c) => c.id === id);
}

export async function fetchCustomCategories(
  coupleId: string,
): Promise<Category[]> {
  const { data, error } = await supabase
    .from("custom_categories")
    .select("id,label,emoji,color")
    .eq("couple_id", coupleId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as CustomCategoryRow[]).map(rowToCategory);
}

export async function upsertCustomCategory(
  coupleId: string,
  userId: string,
  cat: Category,
): Promise<Category> {
  const row = {
    id: cat.id,
    couple_id: coupleId,
    created_by: userId,
    label: cat.label.trim(),
    emoji: cat.emoji.trim() || "🏷️",
    color: cat.color || "#6b7280",
  };
  const { data, error } = await supabase
    .from("custom_categories")
    .upsert(row, { onConflict: "couple_id,id" })
    .select("id,label,emoji,color")
    .single();

  if (error) throw error;
  return rowToCategory(data as CustomCategoryRow);
}

export async function removeCustomCategory(
  coupleId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("custom_categories")
    .delete()
    .eq("couple_id", coupleId)
    .eq("id", id);

  if (error) throw error;
}

function rowToCategory(row: CustomCategoryRow): Category {
  return {
    id: row.id,
    label: row.label,
    emoji: row.emoji,
    color: row.color,
  };
}
