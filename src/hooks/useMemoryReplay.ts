import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MemoryRecapRow,
  ReplayPreset,
  ReplaySlideConfig,
  ReplayTemplateId,
} from "../features/yearReplay/types";
import { normalizeReplayConfig } from "../features/yearReplay/model";
import { supabase } from "../lib/supabase";
import { detectUserTimeZone } from "../lib/userPreferences";

interface UseMemoryReplayOptions {
  spaceId: string | null | undefined;
  rangeStart: string;
  rangeEnd: string;
  preset: ReplayPreset;
  enabled?: boolean;
}

async function edgeErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : "recap_request_failed";
  if (!error || typeof error !== "object" || !("context" in error)) {
    return fallback;
  }
  const response = (error as { context?: unknown }).context;
  if (!(response instanceof Response)) return fallback;
  try {
    const payload = (await response.clone().json()) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

export function useMemoryReplay({
  spaceId,
  rangeStart,
  rangeEnd,
  preset,
  enabled = true,
}: UseMemoryReplayOptions) {
  const [recap, setRecap] = useState<MemoryRecapRow | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const saveRequestIdRef = useRef(0);
  const requestKey = useMemo(
    () => `${spaceId ?? "none"}:${rangeStart}:${rangeEnd}:${preset}`,
    [preset, rangeEnd, rangeStart, spaceId],
  );
  const [dataKey, setDataKey] = useState(requestKey);
  const activeRecap = dataKey === requestKey ? recap : null;
  const activeLoading = dataKey === requestKey
    ? loading
    : Boolean(enabled && spaceId);
  const activeError = dataKey === requestKey ? error : null;

  const load = useCallback(
    async (refresh = false) => {
      if (!enabled || !spaceId) {
        requestIdRef.current += 1;
        saveRequestIdRef.current += 1;
        setDataKey(requestKey);
        setLoading(false);
        setRecap(null);
        setError(null);
        return null;
      }

      const requestId = ++requestIdRef.current;
      saveRequestIdRef.current += 1;
      setDataKey(requestKey);
      setRecap(null);
      setLoading(true);
      setError(null);
      const timezoneOffsetMinutes = -new Date().getTimezoneOffset();
      const { data, error: invokeError } = await supabase.functions.invoke(
        "generate-memory-recap",
        {
          body: {
            space_id: spaceId,
            range_start: rangeStart,
            range_end: rangeEnd,
            preset,
            time_zone: detectUserTimeZone(),
            timezone_offset_minutes: timezoneOffsetMinutes,
            refresh,
          },
        },
      );

      if (requestId !== requestIdRef.current) return null;
      if (invokeError) {
        const technicalMessage = await edgeErrorMessage(invokeError);
        if (requestId !== requestIdRef.current) return null;
        console.error("Failed to generate memory Replay:", technicalMessage);
        setError("recap_request_failed");
        setLoading(false);
        return null;
      }

      const row = data?.recap as MemoryRecapRow | undefined;
      if (!row) {
        setError("recap_missing");
        setLoading(false);
        return null;
      }
      setRecap(row);
      setLoading(false);
      return row;
    },
    [enabled, preset, rangeEnd, rangeStart, requestKey, spaceId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 0);
    return () => {
      window.clearTimeout(timer);
      requestIdRef.current += 1;
      saveRequestIdRef.current += 1;
    };
  }, [load]);

  const updateRecap = useCallback(
    async (updates: {
      template_id?: ReplayTemplateId;
      slide_config_json?: ReplaySlideConfig;
    }) => {
      if (!activeRecap) return null;
      const requestId = ++saveRequestIdRef.current;
      const previous = activeRecap;
      const optimistic: MemoryRecapRow = {
        ...activeRecap,
        ...updates,
        slide_config_json:
          updates.slide_config_json ?? activeRecap.slide_config_json,
      };
      setRecap(optimistic);
      setSaving(true);
      setError(null);
      const { data, error: saveError } = await supabase
        .from("memory_recaps")
        .update(updates)
        .eq("id", activeRecap.id)
        .eq("user_id", activeRecap.user_id)
        .select("*")
        .single();
      if (requestId !== saveRequestIdRef.current) return null;
      setSaving(false);
      if (saveError) {
        setRecap(previous);
        console.error("Failed to save memory Replay:", saveError);
        setError("recap_save_failed");
        throw saveError;
      }
      const saved = data as MemoryRecapRow;
      setRecap(saved);
      return saved;
    },
    [activeRecap],
  );

  const saveConfig = useCallback(
    (config: Partial<ReplaySlideConfig>) =>
      updateRecap({ slide_config_json: normalizeReplayConfig(config) }),
    [updateRecap],
  );

  const setTemplate = useCallback(
    (templateId: ReplayTemplateId) =>
      updateRecap({ template_id: templateId }),
    [updateRecap],
  );

  return {
    recap: activeRecap,
    loading: activeLoading,
    saving,
    error: activeError,
    refresh: () => load(true),
    saveConfig,
    setTemplate,
  };
}
