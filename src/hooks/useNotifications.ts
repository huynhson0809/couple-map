import { useCallback, useEffect, useState } from "react";

const PREF_KEY = "pinly.notif-enabled";

type Perm = "default" | "granted" | "denied" | "unsupported";

function getCurrentPermission(): Perm {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as Perm;
}

export function useNotifications() {
  const [permission, setPermission] = useState<Perm>(() =>
    getCurrentPermission(),
  );
  const [enabled, setEnabledState] = useState<boolean>(() => {
    const stored = localStorage.getItem(PREF_KEY);
    return stored === null ? true : stored === "1";
  });

  useEffect(() => {
    localStorage.setItem(PREF_KEY, enabled ? "1" : "0");
  }, [enabled]);

  const setEnabled = useCallback((v: boolean) => setEnabledState(v), []);

  const request = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported" as Perm;
    const result = await Notification.requestPermission();
    setPermission(result as Perm);
    if (result === "granted") setEnabledState(true);
    return result as Perm;
  }, []);

  const notify = useCallback(
    (title: string, opts?: NotificationOptions & { onClick?: () => void }) => {
      if (!enabled) return;
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;
      // Only show OS notification if page is hidden — otherwise in-app toast handles it
      if (!document.hidden) return;

      const notifOpts: NotificationOptions = {
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        ...opts,
      };

      // Use Service Worker showNotification for iOS compatibility
      // iOS PWA only supports notifications via SW, not new Notification()
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => {
            reg.showNotification(title, notifOpts);
          })
          .catch(() => {
            // Fallback to regular Notification if SW unavailable
            fallbackNotify(title, notifOpts, opts?.onClick);
          });
      } else {
        fallbackNotify(title, notifOpts, opts?.onClick);
      }
    },
    [enabled],
  );

  return { permission, enabled, setEnabled, request, notify };
}

function fallbackNotify(
  title: string,
  opts: NotificationOptions,
  onClick?: () => void,
) {
  try {
    const n = new Notification(title, opts);
    if (onClick) {
      n.onclick = () => {
        window.focus();
        onClick();
        n.close();
      };
    }
  } catch {
    /* ignore */
  }
}
