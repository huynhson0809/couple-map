# Map Style Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real map-style preview bottom sheet so users can inspect a map style before applying it.

**Architecture:** `SettingsPage` will own the selected preview style and continue owning the real applied style through `useMapStyle`. A new focused `MapStylePreviewSheet` component will render an isolated MapLibre preview and expose explicit `Apply` and `Cancel` actions. Existing locked-style upgrade behavior stays unchanged.

**Tech Stack:** React, TypeScript, MapLibre GL via dynamic import, existing `BottomSheet`, existing `Button`, existing i18n dictionary, CSS in `src/index.css`, lightweight contracts in `scripts/performance-contracts.mjs`.

---

## File Structure

- Create `src/components/settings/MapStylePreviewSheet.tsx`
  - Owns the preview sheet UI and isolated MapLibre lifecycle.
  - Receives a `MapStyleOption` and callbacks; never calls `useMapStyle`.
- Modify `src/pages/SettingsPage.tsx`
  - Adds `previewStyle` state.
  - Opens preview for unlocked map styles.
  - Applies style only from the preview sheet confirmation.
- Modify `src/hooks/I18nContext.tsx`
  - Adds labels for preview title, apply action, current-style state, loading, and preview errors.
- Modify `src/index.css`
  - Adds responsive fixed preview dimensions and liquid-glass sheet layout styles.
- Modify `scripts/performance-contracts.mjs`
  - Adds guardrails ensuring style cards no longer apply styles directly and preview lifecycle remains isolated.

---

### Task 1: Add Failing Preview Contract

**Files:**
- Modify: `scripts/performance-contracts.mjs`

- [ ] **Step 1: Add contract reads near the existing `read(...)` constants**

Add these constants after `const wishlistPage = read("src/pages/WishlistPage.tsx");`:

```js
const settingsPage = read("src/pages/SettingsPage.tsx");
const mapStylePreviewSheet = read(
  "src/components/settings/MapStylePreviewSheet.tsx",
);
```

- [ ] **Step 2: Add the failing contract**

Add this assertion after the existing map streak floating button CSS assertion:

```js
assert(
  /MapStylePreviewSheet/.test(settingsPage) &&
    /previewStyle/.test(settingsPage) &&
    /setPreviewStyle\(s\)/.test(settingsPage) &&
    /onApply=\{\(\) => \{[\s\S]*setStyleId\(previewStyle\.id\);[\s\S]*setPreviewStyle\(null\);[\s\S]*\}\}/.test(
      settingsPage,
    ) &&
    !/else\s*\{\s*setStyleId\(s\.id\);\s*\}/.test(settingsPage) &&
    /import\("maplibre-gl"\)/.test(mapStylePreviewSheet) &&
    /mapRef\.current\?\.remove\(\)/.test(mapStylePreviewSheet) &&
    !/useMapStyle/.test(mapStylePreviewSheet),
  "Settings map styles must open an isolated real-map preview and only persist styles from the preview apply action.",
);
```

- [ ] **Step 3: Run contract and verify it fails**

Run:

```bash
npm run check:contracts
```

Expected: FAIL with:

```text
Settings map styles must open an isolated real-map preview and only persist styles from the preview apply action.
```

---

### Task 2: Add I18n Labels

**Files:**
- Modify: `src/hooks/I18nContext.tsx`

- [ ] **Step 1: Add English labels**

In the English `settings.*` block, after `"settings.mapStyle": "Map style",` add:

```ts
"settings.mapStylePreview": "Preview {{style}}",
"settings.mapStylePreviewHint": "Pan or zoom to see how this style feels on the map.",
"settings.applyMapStyle": "Apply style",
"settings.mapStyleApplied": "Applied",
"settings.mapStyleLoading": "Loading preview…",
"settings.mapStyleLoadError": "This style preview could not be loaded.",
```

- [ ] **Step 2: Add Vietnamese labels**

In the Vietnamese `settings.*` block, after `"settings.mapStyle": "Kiểu bản đồ",` add:

```ts
"settings.mapStylePreview": "Xem trước {{style}}",
"settings.mapStylePreviewHint": "Kéo hoặc zoom để xem kiểu bản đồ này trông như thế nào.",
"settings.applyMapStyle": "Áp dụng kiểu này",
"settings.mapStyleApplied": "Đang dùng",
"settings.mapStyleLoading": "Đang tải bản đồ…",
"settings.mapStyleLoadError": "Không tải được bản đồ xem trước.",
```

- [ ] **Step 3: Update i18n typing helper if needed**

If TypeScript rejects string interpolation with `t("settings.mapStylePreview")`, do interpolation in the component with `.replace("{{style}}", label)`:

```ts
const title = t("settings.mapStylePreview").replace("{{style}}", label);
```

- [ ] **Step 4: Run lint to catch key typing errors**

Run:

```bash
npm run lint -- --max-warnings=0
```

Expected: PASS.

---

### Task 3: Create `MapStylePreviewSheet`

**Files:**
- Create: `src/components/settings/MapStylePreviewSheet.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/settings/MapStylePreviewSheet.tsx` with this code:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type {
  MapStyleId,
  MapStyleOption,
} from "../../hooks/useMapStyle";
import type { Lang } from "../../hooks/I18nContext";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";

interface Props {
  style: MapStyleOption | null;
  open: boolean;
  currentStyleId: MapStyleId;
  initialCenter: { lat: number; lng: number };
  lang: Lang;
  labels: {
    title: string;
    hint: string;
    cancel: string;
    apply: string;
    applied: string;
    loading: string;
    error: string;
  };
  onApply: () => void;
  onClose: () => void;
}

const PREVIEW_ZOOM = 11.5;

export function MapStylePreviewSheet({
  style,
  open,
  currentStyleId,
  initialCenter,
  lang,
  labels,
  onApply,
  onClose,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const applied = Boolean(style && style.id === currentStyleId);
  const styleLabel = useMemo(() => {
    if (!style) return "";
    return lang === "vi" ? style.labelVi : style.labelEn;
  }, [lang, style]);

  useEffect(() => {
    if (!open || !style || !containerRef.current) return;

    let cancelled = false;
    setLoaded(false);
    setLoadError(false);

    void import("maplibre-gl")
      .then(({ default: maplibregl }) => {
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: style.url,
          center: [initialCenter.lng, initialCenter.lat],
          zoom: PREVIEW_ZOOM,
          attributionControl: false,
        });

        mapRef.current = map;
        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "bottom-right",
        );
        map.once("load", () => {
          if (!cancelled) setLoaded(true);
        });
        map.once("error", () => {
          if (!cancelled) {
            setLoaded(false);
            setLoadError(true);
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded(false);
          setLoadError(true);
        }
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initialCenter.lat, initialCenter.lng, open, style]);

  if (!style) return null;

  return (
    <BottomSheet open={open} onClose={onClose} title={labels.title}>
      <div className="map-style-preview-sheet">
        <p className="map-style-preview-hint">{labels.hint}</p>
        <div
          className="map-style-preview-map"
          aria-label={labels.title}
          aria-busy={!loaded && !loadError}
        >
          <div ref={containerRef} className="map-style-preview-canvas" />
          {!loaded && !loadError && (
            <div className="map-style-preview-overlay">
              {labels.loading}
            </div>
          )}
          {loadError && (
            <div className="map-style-preview-overlay error">
              {labels.error}
            </div>
          )}
        </div>
        <div className="map-style-preview-actions">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={applied || loadError}
            onClick={onApply}
          >
            {applied ? labels.applied : labels.apply}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
```

- [ ] **Step 2: Run lint and fix import/type errors**

Run:

```bash
npm run lint -- --max-warnings=0
```

Expected: PASS. If `Lang` is not exported from `I18nContext`, export it with:

```ts
export type Lang = "en" | "vi";
```

---

### Task 4: Integrate Preview Flow Into Settings

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Update imports**

Change the map-style import:

```ts
import {
  useMapStyle,
  MAP_STYLES,
  type MapStyleOption,
} from "../hooks/useMapStyle";
```

Add this component import near other UI imports:

```ts
import { MapStylePreviewSheet } from "../components/settings/MapStylePreviewSheet";
```

- [ ] **Step 2: Add preview state**

After `const [initialStyle] = useState(styleId);`, add:

```ts
const [previewStyle, setPreviewStyle] = useState<MapStyleOption | null>(null);
const mapStylePreviewCenter = { lat: 10.8231, lng: 106.6297 };
```

- [ ] **Step 3: Replace unlocked card click behavior**

Inside the map style card `onClick`, replace:

```ts
} else {
  setStyleId(s.id);
}
```

with:

```ts
} else {
  setPreviewStyle(s);
}
```

- [ ] **Step 4: Render the preview sheet after the map style section**

Place this JSX immediately after the closing `</SettingSection>` for the map style section:

```tsx
<MapStylePreviewSheet
  open={Boolean(previewStyle)}
  style={previewStyle}
  currentStyleId={styleId}
  initialCenter={mapStylePreviewCenter}
  lang={lang}
  labels={{
    title: previewStyle
      ? t("settings.mapStylePreview").replace(
          "{{style}}",
          lang === "vi" ? previewStyle.labelVi : previewStyle.labelEn,
        )
      : t("settings.mapStyle"),
    hint: t("settings.mapStylePreviewHint"),
    cancel: t("common.cancel"),
    apply: t("settings.applyMapStyle"),
    applied: t("settings.mapStyleApplied"),
    loading: t("settings.mapStyleLoading"),
    error: t("settings.mapStyleLoadError"),
  }}
  onClose={() => setPreviewStyle(null)}
  onApply={() => {
    if (!previewStyle) return;
    setStyleId(previewStyle.id);
    setPreviewStyle(null);
  }}
/>
```

- [ ] **Step 5: Run the failing contract again**

Run:

```bash
npm run check:contracts
```

Expected: PASS for the map-style preview contract.

---

### Task 5: Add Preview Sheet CSS

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add preview styles near existing `.map-style-*` rules**

After `.map-style-label`, add:

```css
.map-style-preview-sheet {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.map-style-preview-hint {
  margin: -4px 0 0;
  color: var(--muted);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
}

.map-style-preview-map {
  position: relative;
  height: min(46vh, 360px);
  min-height: 260px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  border-radius: 24px;
  background: var(--glass-control-bg);
  box-shadow:
    inset 0 0.75px 0 var(--glass-highlight),
    0 18px 42px rgba(44, 52, 72, 0.14);
}

.map-style-preview-canvas {
  width: 100%;
  height: 100%;
}

.map-style-preview-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: color-mix(in srgb, var(--glass-bg) 74%, transparent);
  color: var(--muted);
  font-size: 14px;
  font-weight: 800;
  text-align: center;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.map-style-preview-overlay.error {
  color: var(--coral);
}

.map-style-preview-actions {
  display: grid;
  grid-template-columns: minmax(112px, 0.8fr) minmax(160px, 1.4fr);
  gap: 12px;
}

@media (max-width: 420px) {
  .map-style-preview-map {
    height: min(44vh, 320px);
    min-height: 230px;
    border-radius: 20px;
  }

  .map-style-preview-actions {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint -- --max-warnings=0
```

Expected: PASS.

---

### Task 6: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run contracts**

Run:

```bash
npm run check:contracts
```

Expected: PASS with:

```text
Performance/API/security contracts passed.
```

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint -- --max-warnings=0
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: exit code 0. Existing Vite chunk-size warnings are acceptable if unchanged.

- [ ] **Step 4: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Manual browser check**

In the app:

1. Open `Settings`.
2. Tap an unlocked inactive map style.
3. Confirm the preview sheet opens and the active style check does not move yet.
4. Tap `Cancel`; confirm style remains unchanged.
5. Tap the same inactive style again, then tap `Apply style`; confirm the active check moves and the main map uses the new style.
6. Tap a locked style; confirm the upgrade prompt opens instead of preview.

- [ ] **Step 6: Commit implementation**

After verification passes:

```bash
git add scripts/performance-contracts.mjs src/hooks/I18nContext.tsx src/components/settings/MapStylePreviewSheet.tsx src/pages/SettingsPage.tsx src/index.css
git commit -m "feat: add map style preview before apply"
```
