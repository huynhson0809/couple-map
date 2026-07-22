import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MemoryRecapRow,
  ReplayPreset,
  ReplaySlideConfig,
  ReplayTemplateId,
} from "../features/yearReplay/types";
import { normalizeReplayConfig } from "../features/yearReplay/model";
import { supabase } from "../lib/supabase";

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

  const load = useCallback(
    async (refresh = false) => {
      if (!enabled || !spaceId) {
        setLoading(false);
        setRecap(null);
        return null;
      }

      const requestId = ++requestIdRef.current;
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
            timezone_offset_minutes: timezoneOffsetMinutes,
            refresh,
          },
        },
      );

      if (requestId !== requestIdRef.current) return null;
      if (invokeError) {
        setError(await edgeErrorMessage(invokeError));
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
    [enabled, preset, rangeEnd, rangeStart, spaceId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateRecap = useCallback(
    async (updates: {
      template_id?: ReplayTemplateId;
      slide_config_json?: ReplaySlideConfig;
    }) => {
      if (!recap) return null;
      const previous = recap;
      const optimistic: MemoryRecapRow = {
        ...recap,
        ...updates,
        slide_config_json: updates.slide_config_json ?? recap.slide_config_json,
      };
      setRecap(optimistic);
      setSaving(true);
      setError(null);
      const { data, error: saveError } = await supabase
        .from("memory_recaps")
        .update(updates)
        .eq("id", recap.id)
        .eq("user_id", recap.user_id)
        .select("*")
        .single();
      setSaving(false);
      if (saveError) {
        setRecap(previous);
        setError(saveError.message);
        throw saveError;
      }
      const saved = data as MemoryRecapRow;
      setRecap(saved);
      return saved;
    },
    [recap],
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
    recap,
    loading,
    saving,
    error,
    refresh: () => load(true),
    saveConfig,
    setTemplate,
  };
}

