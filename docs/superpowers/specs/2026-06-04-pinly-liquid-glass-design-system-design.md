# Pinly Liquid Glass Design System

## Context

Pinly's current UI is functional but visually uneven. Some screens use soft glass styling while auth and several controls still feel like simple web forms. The goal is to make the whole app feel like a clean, premium iOS app with a consistent Full Liquid Glass language.

## Product Direction

Pinly should feel:

- Clean and native, like a modern iOS app.
- Soft premium, romantic, and personal without becoming decorative or noisy.
- Liquid Glass-forward, with strong blur, refraction, depth, and glossy borders.
- Readable and usable on top of both app-generated ambient backgrounds and user photos.

## Background System

Use an adaptive hybrid background system:

1. Ambient base
   - Default generated background for all screens.
   - Uses soft coral, pink, lavender, and cool blue tints.
   - Avoids heavy gradients, decorative blobs, or one-note color themes.

2. Photo material layer
   - When a screen has a couple background, memory photo, or meaningful image context, use it as a blurred/tinted material layer.
   - The raw photo should not sit directly behind text.
   - Surfaces above photo-heavy backgrounds increase opacity/tint to preserve contrast.

## Foundation

### Color

- Keep coral as the main brand/action color.
- Add restrained cool accents for depth: lavender, mist blue, and soft slate.
- Preserve high-contrast text colors for foreground, secondary text, muted text, and disabled states.

### Typography

- Use iOS-like hierarchy: strong headings, readable body text, compact metadata.
- Avoid negative letter spacing globally.
- Use uppercase labels only for section headers and small metadata.

### Radius

- Controls: 14-18px.
- Cards and setting sections: 22-28px.
- Bottom sheets, nav, and large panels: 28-34px.
- Keep radius consistent by token rather than one-off values.

### Spacing

- Increase vertical breathing room in auth and section layouts.
- Use compact spacing for dense lists where scanning matters.
- Preserve stable dimensions for nav, icon buttons, chips, toggles, and repeated cards.

### Glass Surface Levels

1. Glass shell
   - Bottom nav, modals, bottom sheets, floating map controls.
   - Strong blur, glossy border, inner highlights, and deeper shadow.

2. Glass section
   - Settings cards, timeline cards, auth panel, pricing cards.
   - Strong but slightly calmer than shell surfaces.

3. Glass control
   - Inputs, segmented controls, chips, toggles, icon buttons.
   - Clear focus/active/disabled states and readable text.

## Core Components

### Buttons

- Primary buttons use coral with glass-tinted depth and a clear pressed state.
- Secondary buttons use lighter glass surfaces.
- Danger buttons remain red but reduce harshness.
- Buttons keep stable height and text must not overflow.

### Inputs, Textareas, Selects

- Use glass control styling.
- Increase touch comfort.
- Add soft iOS-style focus rings.
- Maintain strong text contrast on photo-backed screens.

### Cards And Sections

- Replace scattered one-off glass styling with shared surface classes or tokens.
- Use glossy border, inner highlight, and controlled shadow consistently.
- Do not nest cards inside cards.

### Bottom Navigation

- Full Liquid Glass shell.
- Active state uses coral icon/text with subtle glow.
- Safe-area behavior must remain correct in Safari and iOS standalone PWA.

### Segmented Controls

- iOS-style pill control.
- Active option uses a capsule with depth/glow.
- Inactive text remains readable.

### Modals And Bottom Sheets

- Use strong glass panels.
- Include clear header/handle patterns.
- Dim or blur the backdrop without reducing foreground readability.

### Chips And Toggles

- Share radius, surface, active, disabled, and focus patterns with the rest of the system.
- Active state uses coral; inactive state remains quiet but legible.

## Screen Rules

### Auth

- Redesign auth screens from simple forms into native premium entry screens.
- Keep flows unchanged: login, register, forgot password, reset password.
- Use brand, panel, input, CTA, links, language switch, loading, and error states consistently.

### Settings

- Keep the current section-based layout.
- Improve visual hierarchy, spacing, and control consistency.
- Use adaptive background and glass sections.

### Timeline, Wishlist, Alerts

- Use clean scan-friendly cards/lists.
- Reduce border clutter.
- Normalize empty, loading, metadata, icon, and active states.

### Map

- Keep map usability first.
- Avoid excessive glass over the map.
- Use compact floating controls and strong glass for sheets/details.

### Streak And Stats

- Allow slightly more expressive visuals.
- Keep the same tokens and glass hierarchy.
- Preserve readability and stable card dimensions.

### Pricing And Upgrade

- Make the experience feel premium.
- Use depth, clean feature rows, and prominent CTAs.
- Do not turn pricing into a marketing landing page.

## Implementation Phases

1. Foundation tokens and global surfaces.
2. Core components.
3. Auth and Settings.
4. Timeline, Wishlist, and Alerts.
5. Map overlays, pin details, and sheets.
6. Pricing, Streak, and Stats polish.

Each phase should be independently buildable and reviewable.

## Data Flow

No app data model changes are required. Existing auth, couple, pins, notifications, subscription, and settings data flows remain unchanged.

## Error Handling

Existing runtime error handling stays intact. UI error states should be restyled consistently, especially auth errors, upload errors, notification permission errors, and loading/empty states.

## Testing And Verification

- Run the production build after each implementation phase.
- Verify mobile and desktop widths.
- Verify iOS Safari and iOS standalone PWA safe-area behavior.
- Verify contrast/readability on ambient-only backgrounds and photo-backed backgrounds.
- Capture screenshots for at least Auth, Settings, Timeline, Map, and Alerts during visual QA.

