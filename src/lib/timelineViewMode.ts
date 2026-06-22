export type TimelineViewMode = "list" | "circle";

export const TIMELINE_VIEW_MODE_STORAGE_KEY = "pinly.timeline.viewMode";

function isTimelineViewMode(value: string | null): value is TimelineViewMode {
  return value === "list" || value === "circle";
}

export function readTimelineViewMode(): TimelineViewMode {
  try {
    const savedMode = localStorage.getItem(TIMELINE_VIEW_MODE_STORAGE_KEY);
    return isTimelineViewMode(savedMode) ? savedMode : "list";
  } catch {
    return "list";
  }
}

export function writeTimelineViewMode(mode: TimelineViewMode) {
  try {
    localStorage.setItem(TIMELINE_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in private or constrained browser contexts.
  }
}
