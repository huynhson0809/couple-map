import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { detectUserTimeZone } from "../lib/userPreferences";
import { useI18n } from "./I18nContext";

const COOLDOWN_KEY = "pinly.nudge.lastSent";

function getLocalToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: detectUserTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function cooldownKey(coupleId: string, userId: string) {
  return `${COOLDOWN_KEY}:${userId}:${coupleId}`;
}

function hasNudgedToday(
  coupleId: string | null,
  userId: string | undefined,
): boolean {
  if (!coupleId || !userId) return false;
  const stored = localStorage.getItem(cooldownKey(coupleId, userId));
  return stored === getLocalToday();
}

function markNudgedToday(coupleId: string, userId: string) {
  localStorage.setItem(cooldownKey(coupleId, userId), getLocalToday());
}

export function useNudge(
  coupleId: string | null,
  userId: string | undefined,
  enabled = true,
) {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<{
    coupleId: string | null;
    userId: string | undefined;
    sending: boolean;
    sent: boolean;
    error: string | null;
    resolved: boolean;
  }>(() => ({
    coupleId,
    userId,
    sending: false,
    sent: hasNudgedToday(coupleId, userId),
    error: null,
    resolved: Boolean(coupleId),
  }));
  const activeSnapshot =
    snapshot.coupleId === coupleId && snapshot.userId === userId
    ? snapshot
    : {
        coupleId,
        userId,
        sending: false,
        sent: false,
        error: null,
        resolved: false,
      };
  const { sending, sent, error } = activeSnapshot;
  const mountedRef = useRef(true);
  const checkRequestRef = useRef(0);
  const sendRequestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Sync with backend on mount — source of truth for "already nudged today"
  useEffect(() => {
    const requestId = ++checkRequestRef.current;
    sendRequestRef.current += 1;
    if (!enabled || !coupleId || !userId) return;
    const locallySent = hasNudgedToday(coupleId, userId);

    let cancelled = false;
    supabase
      .rpc("can_nudge_today", { p_couple_id: coupleId })
      .then(({ data, error: checkError }) => {
        if (cancelled || requestId !== checkRequestRef.current) return;
        if (checkError) {
          console.warn("Could not verify nudge cooldown:", checkError);
          setSnapshot({
            coupleId,
            userId,
            sending: false,
            sent: locallySent,
            error: null,
            resolved: true,
          });
          return;
        }
        // data === true means CAN nudge (hasn't nudged yet)
        // data === false means already nudged today
        if (data === false) {
          markNudgedToday(coupleId, userId);
        }
        setSnapshot({
          coupleId,
          userId,
          sending: false,
          sent: data === false,
          error: null,
          resolved: true,
        });
      });

    return () => {
      cancelled = true;
      checkRequestRef.current += 1;
    };
  }, [coupleId, enabled, userId]);

  // Reset sent status at midnight
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      if (!hasNudgedToday(coupleId, userId)) {
        setSnapshot((current) =>
          current.coupleId === coupleId && current.userId === userId
          ? { ...current, sent: false, resolved: true }
          : current,
        );
      }
    };
    const interval = window.setInterval(check, 60_000);
    return () => window.clearInterval(interval);
  }, [coupleId, enabled, userId]);

  const sendNudge = useCallback(async () => {
    if (
      !enabled ||
      !coupleId ||
      !userId ||
      !activeSnapshot.resolved ||
      sending ||
      sent
    ) return;

    const targetCoupleId = coupleId;
    const requestId = ++sendRequestRef.current;
    setSnapshot({
      coupleId: targetCoupleId,
      userId,
      sending: true,
      sent: false,
      error: null,
      resolved: true,
    });

    const { data, error: fnError } = await supabase.functions.invoke(
      "send-nudge",
      { body: { coupleId: targetCoupleId } },
    );

    if (!mountedRef.current || requestId !== sendRequestRef.current) return;

    if (fnError) {
      console.warn("send-nudge failed:", fnError);
      setSnapshot({
        coupleId: targetCoupleId,
        userId,
        sending: false,
        sent: false,
        error: t("streak.nudgeFailed"),
        resolved: true,
      });
      return;
    }

    if (data?.error === "already_nudged_today") {
      markNudgedToday(targetCoupleId, userId);
      setSnapshot({
        coupleId: targetCoupleId,
        userId,
        sending: false,
        sent: true,
        error: null,
        resolved: true,
      });
      return;
    }

    if (data?.error) {
      console.warn("send-nudge rejected:", data.error, data.reason);
      setSnapshot({
        coupleId: targetCoupleId,
        userId,
        sending: false,
        sent: false,
        error: t("streak.nudgeFailed"),
        resolved: true,
      });
      return;
    }

    if (data?.sent !== true) {
      const reason = data?.reason;
      const terminal =
        reason === "partner_already_posted" ||
        reason === "partner_disabled_reminders";
      const reasonMessage =
        reason === "partner_already_posted"
          ? t("streak.nudgeAlreadyPosted")
          : reason === "sender_not_posted"
            ? t("streak.nudgePostFirst")
            : reason === "partner_disabled_reminders"
              ? t("streak.nudgeDisabled")
              : t("streak.nudgeFailed");
      if (reason === "partner_disabled_reminders") {
        markNudgedToday(targetCoupleId, userId);
      }
      setSnapshot({
        coupleId: targetCoupleId,
        userId,
        sending: false,
        sent: terminal,
        error: reasonMessage,
        resolved: true,
      });
      return;
    }

    // Success
    markNudgedToday(targetCoupleId, userId);
    setSnapshot({
      coupleId: targetCoupleId,
      userId,
      sending: false,
      sent: true,
      error: null,
      resolved: true,
    });
  }, [activeSnapshot.resolved, coupleId, enabled, sending, sent, t, userId]);

  const canNudge = enabled && activeSnapshot.resolved && !sent && !sending;

  return {
    sendNudge,
    sending: enabled ? sending : false,
    sent: enabled ? sent : false,
    error: enabled ? error : null,
    canNudge,
  };
}
