import type { BeforeSendEvent } from "@vercel/analytics/react";

const TRACKABLE_PUBLIC_PATHS = new Set([
  "/",
  "/about",
  "/features",
  "/pricing",
  "/faq",
  "/guides/memory-map",
  "/guides/travel-memory-journal",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
]);

const ALLOWED_CAMPAIGN_PARAMETERS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_id",
  "utm_term",
  "utm_content",
  "utm_source_platform",
  "utm_creative_format",
  "utm_marketing_tactic",
] as const;

export function isTrackablePublicPath(pathname: string) {
  const normalizedPath =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return TRACKABLE_PUBLIC_PATHS.has(normalizedPath);
}

export function filterWebAnalyticsEvent(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  try {
    const baseUrl =
      typeof window === "undefined" ? "https://pinly.tech" : window.location.origin;
    const url = new URL(event.url, baseUrl);

    if (!isTrackablePublicPath(url.pathname)) return null;
    if (
      url.pathname === "/" &&
      typeof document !== "undefined" &&
      !document.querySelector(".lp")
    ) {
      return null;
    }

    const campaignParameters = ALLOWED_CAMPAIGN_PARAMETERS.flatMap((key) => {
      const value = url.searchParams.get(key)?.trim();
      return value ? ([[key, value.slice(0, 200)]] as const) : [];
    });

    url.search = "";
    url.hash = "";
    for (const [key, value] of campaignParameters) {
      url.searchParams.set(key, value);
    }

    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}
