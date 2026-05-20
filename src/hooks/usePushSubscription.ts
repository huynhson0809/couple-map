import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSubscription(userId: string | undefined) {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const didInit = useRef(false);

  // Check existing subscription on mount
  useEffect(() => {
    if (!userId || didInit.current) return;
    didInit.current = true;

    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    }
    check();
  }, [userId]);

  const subscribe = useCallback(async () => {
    if (!userId || !VAPID_PUBLIC_KEY) {
      console.warn("[Push] Missing userId or VAPID_PUBLIC_KEY");
      return false;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("[Push] PushManager not supported");
      return false;
    }

    setLoading(true);
    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setLoading(false);
        return false;
      }

      const reg = await navigator.serviceWorker.ready;

      // Check if already subscribed
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            .buffer as ArrayBuffer,
        });
      }

      const subJson = sub.toJSON();
      const endpoint = sub.endpoint;
      const p256dh = subJson.keys?.p256dh ?? "";
      const auth = subJson.keys?.auth ?? "";

      // Save to Supabase
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          { user_id: userId, endpoint, p256dh, auth },
          { onConflict: "endpoint" },
        );

      if (error) {
        console.error("Failed to save push subscription:", error);
        setLoading(false);
        return false;
      }

      setSubscribed(true);
      setLoading(false);
      return true;
    } catch (err) {
      console.error("Push subscribe error:", err);
      setLoading(false);
      return false;
    }
  }, [userId]);

  const unsubscribe = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Remove from DB
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint);

        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      console.error("Push unsubscribe error:", err);
    }
    setLoading(false);
  }, [userId]);

  return { subscribed, loading, subscribe, unsubscribe };
}
