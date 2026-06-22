import { getCategory, type Category } from "./categories";
import type { Pin, PinCategory } from "../types";

export const MAX_PIN_CATEGORIES = 3;

export function normalizeCategoryIds(
  ids: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    const trimmed = id?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
    if (next.length >= MAX_PIN_CATEGORIES) break;
  }
  return next;
}

export function normalizePinCategories(
  rows: PinCategory[] | null | undefined,
): PinCategory[] {
  const seen = new Set<string>();
  const next: PinCategory[] = [];

  for (const row of [...(rows ?? [])].sort(
    (a, b) => a.position - b.position,
  )) {
    const categoryId = row.category_id.trim();
    if (!categoryId || seen.has(categoryId)) continue;
    seen.add(categoryId);
    next.push({ ...row, category_id: categoryId, position: next.length });
    if (next.length >= MAX_PIN_CATEGORIES) break;
  }

  return next;
}

export function getPinCategoryIds(
  pin: Pick<Pin, "category" | "categories">,
): string[] {
  const fromRows = normalizePinCategories(pin.categories).map(
    (row) => row.category_id,
  );
  if (fromRows.length > 0) return normalizeCategoryIds(fromRows);
  return normalizeCategoryIds([pin.category]);
}

export function getPrimaryCategoryId(
  pin: Pick<Pin, "category" | "categories">,
): string | null {
  return getPinCategoryIds(pin)[0] ?? null;
}

export function getPrimaryCategory(
  pin: Pick<Pin, "category" | "categories">,
  customCategories: Category[] = [],
): Category | undefined {
  return getCategory(getPrimaryCategoryId(pin), customCategories);
}

export function resolvePinCategories(
  pin: Pick<Pin, "category" | "categories">,
  customCategories: Category[] = [],
): Category[] {
  const ids = getPinCategoryIds(pin);
  return ids.flatMap((id) => {
    const category = getCategory(id, customCategories);
    return category ? [category] : [];
  });
}

export function toPinCategoryRows(
  pinId: string,
  coupleId: string,
  categoryIds: string[],
): Array<Pick<PinCategory, "pin_id" | "couple_id" | "category_id" | "position">> {
  return normalizeCategoryIds(categoryIds).map((categoryId, position) => ({
    pin_id: pinId,
    couple_id: coupleId,
    category_id: categoryId,
    position,
  }));
}
