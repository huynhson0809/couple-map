import type { Lang } from "../hooks/I18nContext";

export function detectUserLocale(): Lang {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("vi") ? "vi" : "en";
}

export function detectUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isSupportedLocale(value: unknown): value is Lang {
  return value === "en" || value === "vi";
}

export function isUsableTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
