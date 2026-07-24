import type { Lang } from "../hooks/I18nContext";
import { formatLocalizedDate, localeForLanguage } from "./localeFormat.ts";

export function formatRelativeTime(value: string, lang: Lang, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";

  const difference = timestamp - now;
  const absoluteDifference = Math.abs(difference);
  const formatter = new Intl.RelativeTimeFormat(localeForLanguage(lang), {
    numeric: "auto",
  });

  if (absoluteDifference < 60_000) return formatter.format(0, "second");
  if (absoluteDifference < 3_600_000) {
    return formatter.format(Math.round(difference / 60_000), "minute");
  }
  if (absoluteDifference < 86_400_000) {
    return formatter.format(Math.round(difference / 3_600_000), "hour");
  }
  if (absoluteDifference < 7 * 86_400_000) {
    return formatter.format(Math.round(difference / 86_400_000), "day");
  }

  return formatLocalizedDate(value, lang, {
    day: "numeric",
    month: "short",
  });
}
