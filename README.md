# Pinly

Bản đồ kỷ niệm của 2 người. React + Vite + TypeScript + MapLibre GL JS + OpenFreeMap + Supabase + Cloudinary. PWA-ready.

## Setup

1. `npm install`
2. Create a Supabase project (free tier). Open the SQL editor and run [supabase/schema.sql](supabase/schema.sql).
3. Create a Cloudinary account. Uploads are signed by a Supabase Edge Function; do not expose an unsigned upload preset in production.
4. Copy `.env.example` → `.env.local` and fill in:
   ```
   VITE_SUPABASE_URL=
   VITE_SUPABASE_ANON_KEY=
   VITE_CLOUDINARY_CLOUD_NAME=
   VITE_MAPBOX_ACCESS_TOKEN=
   ```
5. Run the SQL migrations in `supabase/`, including `supabase/migration_security_hardening.sql`.
6. Set Edge Function secrets in Supabase:
   ```
   supabase secrets set SEND_PUSH_SECRET=... STREAK_REMINDER_SECRET=...
   supabase secrets set CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...
   ```
7. Deploy Edge Functions:
   ```
   supabase functions deploy send-push --no-verify-jwt
   supabase functions deploy delete-pin-media
   supabase functions deploy send-streak-reminders --no-verify-jwt
   supabase functions deploy sign-cloudinary-upload
   ```
8. The Pinly PWA icon lives at `public/favicon.svg`.

## Develop

```bash
npm run dev
```

## Build

```bash
npm run build && npm run preview
```

## Deploy

Push to GitHub → import into Vercel (framework: Vite) → set the env vars → deploy.

## Stack notes

- **MapLibre GL JS** + **OpenFreeMap** tiles — free forever, no API key, no usage cap.
- **Mapbox Geocoding** address search — set `VITE_MAPBOX_ACCESS_TOKEN` to search streets/addresses with coordinate results. If the token is missing or Mapbox returns nothing, the app falls back to Nominatim.
- **Nominatim** reverse geocoding — free; we omit a custom User-Agent (browsers forbid setting it from `fetch`), so requests inherit the browser UA. For heavy traffic, switch to a self-hosted Nominatim or a paid provider.
- **Supabase RLS** — every pin/image row is gated by `get_my_couple_id()` so each couple only sees their own data.
- **Cloudinary** — signed uploads via Supabase Edge Function, scoped to `pinly/<couple_id>`, with on-the-fly transforms via `w_<n>,q_auto,f_auto`.

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
