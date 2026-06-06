# Map Style Preview Design

## Goal

Let users preview a real map style before applying it. The current Settings screen only shows a three-color swatch and applies the style immediately on tap. The new flow should make the decision feel safer and more polished: tap a style, inspect a real map preview, then explicitly apply or cancel.

## User Experience

In `Settings > Map Style`, each unlocked inactive style opens a liquid-glass bottom sheet instead of applying immediately. The active style remains visually selected with the existing check indicator. Locked styles keep the current upgrade behavior and do not open the preview sheet.

The preview sheet title uses the selected style name, such as `Preview Romantic` or `Xem trước Lãng mạn`. The sheet contains a real interactive map preview rendered with that style. The preview should show a familiar default camera: prefer the latest map center if available in app state, otherwise use the existing Ho Chi Minh City fallback. Users can pan and zoom the preview without changing the main map.

The bottom actions are `Cancel` and `Apply style`. `Cancel` closes the sheet without saving. `Apply style` calls the existing `setStyleId(style.id)`, closes the sheet, and updates the active card. If the user taps the already active style, the app may still open preview for inspection, but the primary action should read as already applied or be disabled to avoid a confusing no-op.

## Components

Add a small focused component:

`MapStylePreviewSheet`

Props:
- `style`: the selected `MapStyleOption`
- `open`: whether the sheet is visible
- `currentStyleId`: the applied style id
- `initialCenter`: `{ lat, lng }`
- `lang`: for localized labels
- `onApply`: apply callback
- `onClose`: close callback

This component owns only preview UI and the preview map lifecycle. It does not call `useMapStyle` directly, so it cannot accidentally persist a style before the user confirms.

`SettingsPage` owns:
- `previewStyle`
- opening preview on unlocked style tap
- applying the selected style by calling `setStyleId`
- preserving the existing upgrade prompt behavior for locked styles

## Map Preview Behavior

Use MapLibre for the preview map, but keep the instance isolated from the main `MapView`. The preview map should be created when the sheet is open and destroyed on close/unmount. It should use `style.url`, disable heavy app-specific marker clustering, and keep controls minimal. This keeps the preview accurate without pulling in the full memory-marker rendering path.

The preview area should have fixed responsive dimensions so it does not jump while tiles load. A skeleton or subtle glass shimmer can show while the map initializes. If a style URL fails to load, show a compact error state with `Cancel` still available and `Apply style` disabled for that failed preview.

## Visual Direction

Keep the liquid-glass language already used in Settings. The sheet should feel like a temporary inspection panel, not a new page. The preview map should be large enough to reveal water, roads, labels, and land color, because those are the differences users care about. The old swatch stays useful as a quick thumbnail in the card row, but it is no longer the only preview.

## Accessibility

The style cards remain buttons with clear `aria-label` text. The preview sheet should trap focus through the existing bottom-sheet behavior if available, expose a clear title, and label the preview region as decorative or descriptive. `Apply style` and `Cancel` must be reachable by keyboard and screen readers.

## Testing

Add a contract to ensure `SettingsPage` no longer applies map styles directly from the card click handler. Applying must happen through the preview sheet confirmation path.

Manual and automated verification:
- Unlocked inactive style opens preview and does not change `localStorage` immediately.
- `Cancel` leaves the active style unchanged.
- `Apply style` persists the style and updates the active card.
- Locked style still opens the upgrade prompt.
- Build and lint pass.

## Out Of Scope

This phase does not change subscription limits, add new map styles, or redesign the entire Settings section. It only adds a real preview-before-apply flow for existing map styles.
