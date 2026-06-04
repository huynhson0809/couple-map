# Bottom Nav Safe Area Design

## Context

On real iPhone devices, the app shows an unwanted white gap below the bottom navigation, between the nav surface and the home indicator. The project already sets `viewport-fit=cover`, and the current bottom nav is fixed to `bottom: 0` while adding `env(safe-area-inset-bottom)` to its padding.

## Goal

Remove the visible gap under the bottom nav on real devices while keeping nav items comfortably above the home indicator and preserving the existing glass visual style.

## Recommended Approach

Use the existing CSS layout and update only the bottom-nav safe-area handling:

- Let the bottom nav surface extend through the safe-area region.
- Keep the interactive nav items visually above the home indicator with internal padding.
- Define CSS variables for nav item height and safe-area-aware reserved page padding so scrollable pages do not end behind the nav.

## Alternatives Considered

1. Add a separate fixed background patch below the nav. This is smaller but can look like a visual workaround if the nav and patch do not blend perfectly.
2. Rework `html`, `body`, `#root`, and `.app-shell` viewport sizing. This could address root causes but has higher risk for map, auth, setup, and scroll behavior.

## Components

- `src/index.css`
  - `.bottom-nav`: extend the glass/nav background into the safe area.
  - `.page`: reserve bottom padding based on the effective nav height.

No React component changes are expected.

## Data Flow

No data flow changes. This is a layout-only CSS fix.

## Error Handling

No runtime error handling changes. The CSS should degrade naturally on browsers where `env(safe-area-inset-bottom)` resolves to `0px`.

## Testing

- Run the production build to catch CSS or TypeScript regressions.
- Verify in a mobile-sized browser viewport that page content remains scrollable and is not hidden by the nav.
- On a real iPhone/PWA view, confirm there is no white gap between the nav surface and the home indicator.

