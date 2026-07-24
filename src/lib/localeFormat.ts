export type DisplayLanguage = "en" | "vi";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function localeForLanguage(language: string) {
  return language === "vi" ? "vi-VN" : "en-US";
}

export function formatLocalizedDate(
  value: string | number | Date,
  language: string,
  options?: Intl.DateTimeFormatOptions,
) {
  const isDateOnly = typeof value === "string" && DATE_ONLY_PATTERN.test(value);
  const date = value instanceof Date
    ? value
    : new Date(isDateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "";
  const formatterOptions = isDateOnly
    ? { ...options, timeZone: "UTC" }
    : options;
  return new Intl.DateTimeFormat(
    localeForLanguage(language),
    formatterOptions,
  ).format(date);
}

function calendarDayNumber(value: string | number | Date) {
  if (typeof value === "string") {
    const match = DATE_ONLY_PATTERN.exec(value);
    if (match) {
      return Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
      ) / DAY_MS;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ) / DAY_MS;
}

export function differenceInCalendarDays(
  start: string | number | Date,
  end: string | number | Date,
) {
  const startDay = calendarDayNumber(start);
  const endDay = calendarDayNumber(end);
  if (startDay === null || endDay === null) return null;
  return Math.trunc(endDay - startDay);
}

export function formatLocalizedNumber(
  value: number,
  language: string,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(
    localeForLanguage(language),
    options,
  ).format(value);
}

export function formatLocalDateInputValue(value = new Date()) {
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
