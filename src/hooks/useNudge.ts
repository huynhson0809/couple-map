import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const COOLDOWN_KEY = "pinly.nudge.lastSent";

function getVnToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function cooldownKey(coupleId: string) {
  return `${COOLDOWN_KEY}:${coupleId}`;
}

function hasNudgedToday(coupleId: string | null): boolean {
  if (!coupleId) return false;
  const stored = localStorage.getItem(cooldownKey(coupleId));
  return stored === getVnToday();
}

function markNudgedToday(coupleId: string) {
  localStorage.setItem(cooldownKey(coupleId), getVnToday());
}

export function useNudge(coupleId: string | null, enabled = true) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(() => hasNudgedToday(coupleId));
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Sync with backend on mount — source of truth for "already nudged today"
  useEffect(() => {
    if (!enabled || !coupleId) return;
    if (hasNudgedToday(coupleId)) {
      queueMicrotask(() => setSent(true));
      return;
    }

    let cancelled = false;
    supabase
      .rpc("can_nudge_today", { p_couple_id: coupleId })
      .then(({ data }) => {
        if (cancelled) return;
        // data === true means CAN nudge (hasn't nudged yet)
        // data === false means already nudged today
        if (data === false) {
          markNudgedToday(coupleId);
          setSent(true);
        } else {
          setSent(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [coupleId, enabled]);

  // Reset sent status at midnight
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      if (!hasNudgedToday(coupleId)) setSent(false);
    };
    const interval = window.setInterval(check, 60_000);
    return () => window.clearInterval(interval);
  }, [coupleId, enabled]);

  const sendNudge = useCallback(async () => {
    if (!enabled || !coupleId || sending || sent) return;

    setSending(true);
    setError(null);

    const { data, error: fnError } = await supabase.functions.invoke(
      "send-nudge",
      { body: { coupleId } },
    );

    if (!mountedRef.current) return;

    if (fnError) {
      setSending(false);
      setError(fnError.message || "Gửi nhắc thất bại");
      return;
    }

    if (data?.error === "already_nudged_today") {
      markNudgedToday(coupleId);
      setSent(true);
      setSending(false);
      setError("Bạn đã nhắc hôm nay rồi");
      return;
    }

    if (data?.error) {
      setSending(false);
      setError(data.reason ?? data.error);
      return;
    }

    // Success
    markNudgedToday(coupleId);
    setSent(true);
    setSending(false);
  }, [coupleId, enabled, sending, sent]);

  const canNudge = enabled && !sent && !sending;

  return {
    sendNudge,
    sending: enabled ? sending : false,
    sent: enabled ? sent : false,
    error: enabled ? error : null,
    canNudge,
  };
}
