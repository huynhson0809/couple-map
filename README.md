# Mapmate

Bản đồ kỷ niệm của 2 người. React + Vite + TypeScript + MapLibre GL JS + OpenFreeMap + Supabase + Cloudinary. PWA-ready.

## Setup

1. `npm install`
2. Create a Supabase project (free tier). Open the SQL editor and run [supabase/schema.sql](supabase/schema.sql).
3. Create a Cloudinary account. Settings → Upload → add an **unsigned** upload preset (folder `mapmate`).
4. Copy `.env.example` → `.env.local` and fill in:
   ```
   VITE_SUPABASE_URL=
   VITE_SUPABASE_ANON_KEY=
   VITE_CLOUDINARY_CLOUD_NAME=
   VITE_CLOUDINARY_UPLOAD_PRESET=
   ```
5. Drop two PWA icons into `public/icons/` — `icon-192.png` and `icon-512.png`.

## Develop

```bash
npm run dev
```

## Build

```bash
npm run build && npm run preview
```

## Deploy

Push to GitHub → import into Vercel (framework: Vite) → set the 4 env vars → deploy.

## Stack notes

- **MapLibre GL JS** + **OpenFreeMap** tiles — free forever, no API key, no usage cap.
- **Nominatim** reverse geocoding — free; we omit a custom User-Agent (browsers forbid setting it from `fetch`), so requests inherit the browser UA. For heavy traffic, switch to a self-hosted Nominatim or a paid provider.
- **Supabase RLS** — every pin/image row is gated by `get_my_couple_id()` so each couple only sees their own data.
- **Cloudinary** — unsigned upload preset, on-the-fly transforms via `w_<n>,q_auto,f_auto`.

## Phase 1 MVP — implemented

- Email/password auth
- Couple pairing via invite code
- Shared MapLibre map (Liberty style, OpenFreeMap tiles)
- Long-press map to drop pin / FAB → GPS pin
- Create pin: title, note, up to 5 photos (compressed → Cloudinary), reverse-geocoded address
- Pin detail bottom sheet with image carousel, delete (creator only), share, open in Google Maps
- Realtime sync between paired devices
- PWA: installable, offline tile/image cache

Phase 2–4 features (heatmap, stats, timeline, share card, bucket list) are scoped by the type/hook layer and ready to extend per the build guide.
