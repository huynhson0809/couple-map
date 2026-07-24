import { supabase } from "./supabase";
import type { Category } from "./categoryCatalog";

export {
  CATEGORIES,
  getAllCategories,
  getBuiltInCategories,
  getCategory,
  isBuiltInCategory,
  normalizeCategoryLocale,
  type Category,
  type CategoryLocale,
} from "./categoryCatalog";

interface CustomCategoryRow {
  id: string;
  label: string;
  emoji: string;
  color: string;
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
  const { error: pinCategoryError } = await supabase
    .from("pin_categories")
    .delete()
    .eq("couple_id", coupleId)
    .eq("category_id", id);

  if (pinCategoryError) throw pinCategoryError;

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
