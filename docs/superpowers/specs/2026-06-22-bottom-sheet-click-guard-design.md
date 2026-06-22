# Bottom Sheet Click Guard One-Shot Design

## Problem

After closing a bottom sheet, tapping the map `+` button can intermittently do nothing. The failure is most visible when the user closes a modal/detail/add sheet and immediately taps `+` again.

The likely root cause is the global `BottomSheet` click guard. It was added to prevent a closing backdrop tap from falling through to an item behind the sheet, but the guard currently stays installed long enough that it can swallow a real next tap on the `+` button.

## Goals

- Preserve the existing protection against backdrop click-through.
- Ensure a real user tap after the sheet is closed can reach the `+` button.
- Keep the fix inside the shared `BottomSheet` behavior instead of adding MapPage-specific hacks.
- Add contract coverage so the guard cannot regress into a long-lived global event blocker.

## Non-Goals

- Do not change GPS/location behavior in `MapPage`.
- Do not change subscription gating for creating memories.
- Do not redesign the add-memory modal.
- Do not remove the timeline click-through fix.

## Design

Use a one-shot click guard in `BottomSheet`.

When a backdrop pointer-up closes the sheet, `installBackdropClickGuard()` will still add capture listeners for the native compatibility event sequence. However, once the guard blocks the first retargeted event, it should immediately release itself. A short fallback timer remains in case no compatibility event fires.

The guard should:

- Add the `bottom-sheet-click-guard` root class while active.
- Prevent and stop the retargeted close-gesture end/click events with `stopImmediatePropagation()`.
- Avoid guarding new-gesture start events such as `pointerdown`, `touchstart`, and `mousedown`, because those can be the user's next intentional tap on `+`.
- Remove all native listeners immediately after that first blocked event.
- Use a short fallback timeout, around 180ms, not the current long window.
- Clean up on unmount exactly as today.

This keeps the original safety behavior for the closing tap while avoiding a half-second window where the next intentional tap on `+` can be eaten.

## Components

- `src/components/ui/BottomSheet.tsx`
  - Owns the click guard lifecycle.
  - Needs a `releaseGuard()` helper or equivalent cleanup path.
  - `stopBackdropClickThrough()` should call release after blocking one event.

- `src/index.css`
  - Existing `.bottom-sheet-click-guard` styles remain valid.
  - No new visual styling is expected.

- Contract script
  - Extend the existing bottom-sheet guard assertions, likely in `scripts/timeline-circle-layout-contract.mjs` or a new focused contract, to require one-shot release and a short fallback.

## Testing

- Contract should fail before the implementation because the guard currently has only a long fallback cleanup.
- Contract should pass after implementation.
- Targeted ESLint should run for `src/components/ui/BottomSheet.tsx` and the changed contract script.
- `git diff --check` should run for changed files.
- `npm run build` should pass.
- Full lint may still fail on the unrelated existing `src/hooks/useCoupleRealtime.ts` ref rule; report it separately if unchanged.

## Success Criteria

- Closing a sheet by tapping outside still does not trigger an item behind the sheet.
- Immediately tapping the map `+` after a sheet closes is not blocked by stale global guard listeners.
- The guard is still present, but only for the close gesture's leftover event sequence.
