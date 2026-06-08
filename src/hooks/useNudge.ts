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

function hasNudgedToday(): boolean {
  const stored = localStorage.getItem(COOLDOWN_KEY);
  return stored === getVnToday();
}

export function useNudge(coupleId: string | null) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(() => hasNudgedToday());
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset sent status at midnight
  useEffect(() => {
    const check = () => {
      if (!hasNudgedToday()) setSent(false);
    };
    const interval = window.setInterval(check, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const sendNudge = useCallback(async () => {
    if (!coupleId || sending || sent) return;

    setSending(true);
    setError(null);

    const { data, error: fnError } = await supabase.functions.invoke(
      "send-nudge",
      { body: {} },
    );

    if (!mountedRef.current) return;

    if (fnError) {
      setSending(false);
      setError(fnError.message || "Gửi nhắc thất bại");
      return;
    }

    if (data?.error === "already_nudged_today") {
      localStorage.setItem(COOLDOWN_KEY, getVnToday());
      setSent(true);
      setSending(false);
      return;
    }

    if (data?.error) {
      setSending(false);
      setError(data.reason ?? data.error);
      return;
    }

    // Treat "sent but push failed" same as sent (nudge logged, don't retry)
    localStorage.setItem(COOLDOWN_KEY, getVnToday());
    setSent(true);
    setSending(false);
  }, [coupleId, sending, sent]);

  const canNudge = !sent && !sending;

  return { sendNudge, sending, sent, error, canNudge };
}
