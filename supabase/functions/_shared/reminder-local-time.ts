export type ReminderLocale = "en" | "vi";

export function normalizeReminderLocale(value: unknown): ReminderLocale {
  return value === "vi" ? "vi" : "en";
}

export function normalizeReminderTimeZone(
  value: unknown,
  fallback = "UTC",
) {
  const safeFallback = isValidTimeZone(fallback) ? fallback : "UTC";
  if (typeof value !== "string" || !value.trim()) return safeFallback;
  return isValidTimeZone(value) ? value : safeFallback;
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function localReminderParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeReminderTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
  };
}

export function recipientReminderWindow({
  now,
  timeZone,
  force,
  forcedDate,
  forcedHour,
  reminderHours,
}: {
  now: Date;
  timeZone: string;
  force: boolean;
  forcedDate: string;
  forcedHour: number;
  reminderHours: readonly number[];
}) {
  const local = localReminderParts(now, timeZone);
  const hasValidForcedHour = forcedHour >= 0 && forcedHour <= 23;
  const date = force && forcedDate ? forcedDate : local.date;
  const hour = force && hasValidForcedHour ? forcedHour : local.hour;
  return {
    date,
    hour,
    shouldSend: force || reminderHours.includes(hour),
  };
}

function addIsoDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function zonedMidnightUtc(isoDate: string, timeZone: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day);
  let candidate = targetUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const value = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const renderedAsUtc = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    );
    candidate -= renderedAsUtc - targetUtc;
  }

  return new Date(candidate).toISOString();
}

export function localDayBounds(isoDate: string, timeZone: string) {
  const safeTimeZone = normalizeReminderTimeZone(timeZone);
  return {
    start: zonedMidnightUtc(isoDate, safeTimeZone),
    end: zonedMidnightUtc(addIsoDays(isoDate, 1), safeTimeZone),
  };
}
