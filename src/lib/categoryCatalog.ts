export interface Category {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

export type CategoryLocale = "en" | "vi";

interface BuiltInCategoryDefinition extends Omit<Category, "label"> {
  labels: Record<CategoryLocale, string>;
}

const BUILT_IN_CATEGORY_DEFINITIONS: BuiltInCategoryDefinition[] = [
  {
    id: "breakfast",
    labels: { en: "Breakfast", vi: "Ăn sáng" },
    emoji: "🥐",
    color: "#f59e0b",
  },
  {
    id: "lunch",
    labels: { en: "Lunch", vi: "Ăn trưa" },
    emoji: "🍱",
    color: "#f97316",
  },
  {
    id: "dinner",
    labels: { en: "Dinner", vi: "Ăn tối" },
    emoji: "🍽️",
    color: "#ef4444",
  },
  {
    id: "bubble_tea",
    labels: { en: "Bubble tea", vi: "Trà sữa" },
    emoji: "🧋",
    color: "#a855f7",
  },
  {
    id: "cafe",
    labels: { en: "Cafe", vi: "Cà phê" },
    emoji: "☕",
    color: "#92400e",
  },
  {
    id: "movie",
    labels: { en: "Movies", vi: "Xem phim" },
    emoji: "🎬",
    color: "#6366f1",
  },
  {
    id: "date",
    labels: { en: "Date", vi: "Hẹn hò" },
    emoji: "💝",
    color: "#e11d48",
  },
  {
    id: "shopping",
    labels: { en: "Shopping", vi: "Mua sắm" },
    emoji: "🛍️",
    color: "#db2777",
  },
  {
    id: "travel",
    labels: { en: "Travel", vi: "Du lịch" },
    emoji: "✈️",
    color: "#0ea5e9",
  },
];

export function normalizeCategoryLocale(locale: unknown): CategoryLocale {
  return locale === "vi" ? "vi" : "en";
}

export function getBuiltInCategories(locale: unknown = "en"): Category[] {
  const normalizedLocale = normalizeCategoryLocale(locale);
  return BUILT_IN_CATEGORY_DEFINITIONS.map(({ labels, ...category }) => ({
    ...category,
    label: labels[normalizedLocale],
  }));
}

// English is the safe fallback for non-React helpers and international users.
export const CATEGORIES: Category[] = getBuiltInCategories("en");

export function isBuiltInCategory(id: string | null | undefined): boolean {
  return (
    !!id && BUILT_IN_CATEGORY_DEFINITIONS.some((category) => category.id === id)
  );
}

export function getAllCategories(
  customCategories: Category[] = [],
  locale: unknown = "en",
): Category[] {
  return [
    ...getBuiltInCategories(locale),
    ...customCategories.filter((category) => !isBuiltInCategory(category.id)),
  ];
}

export function getCategory(
  id: string | null | undefined,
  categories: Category[] = [],
  locale: unknown = "en",
): Category | undefined {
  if (!id) return undefined;
  return (
    categories.find((category) => category.id === id) ??
    getBuiltInCategories(locale).find((category) => category.id === id)
  );
}
