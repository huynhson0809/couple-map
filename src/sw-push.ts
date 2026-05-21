// Custom service worker with Workbox precaching + Web Push notifications.
// Used with vite-plugin-pwa injectManifest strategy.

/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

// --- Workbox setup ---
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Navigation fallback
registerRoute(
  ({ request }) =>
    request.mode === "navigate" &&
    !request.url.match(/^\/api\//) &&
    !request.url.match(/^\/auth\//),
  new NetworkFirst({ cacheName: "pages" }),
);

// Tile caching
registerRoute(
  ({ url }) => url.hostname === "tiles.openfreemap.org",
  new CacheFirst({
    cacheName: "openfreemap-tiles",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 500,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  }),
);

// Cloudinary images
registerRoute(
  ({ url }) => url.hostname === "res.cloudinary.com",
  new CacheFirst({
    cacheName: "cloudinary-images",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  }),
);

// Supabase API
registerRoute(
  ({ url }) =>
    url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/"),
  new NetworkFirst({
    cacheName: "supabase-api",
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 })],
  }),
);

// --- Web Push ---

// Handle incoming push events
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: {
    title?: string;
    body?: string;
    icon?: string;
    badge?: string;
    data?: { url?: string };
  };

  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Pinly", body: event.data.text() };
  }

  const title = payload.title || "Pinly";
  const options: NotificationOptions = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-192.png",
    data: payload.data || { url: "/" },
    tag: "pinly-pin",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click — open/focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
