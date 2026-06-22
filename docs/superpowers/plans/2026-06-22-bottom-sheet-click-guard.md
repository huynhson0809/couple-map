# Bottom Sheet Click Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bottom-sheet backdrop click guard one-shot so it still blocks the closing tap's click-through, but cannot swallow a later intentional tap on the map `+` button.

**Architecture:** Keep the fix inside `BottomSheet`, where the global guard is owned. The guard will install native capture listeners for close-gesture end/click events, immediately clean itself up after blocking the retargeted event, and use a short timeout fallback.

**Tech Stack:** React, TypeScript, DOM event listeners, existing Node contract scripts, Vite build.

---

## File Structure

- Modify: `scripts/timeline-circle-layout-contract.mjs`
  - Extend the existing bottom-sheet guard contract with one-shot cleanup and short fallback assertions.
- Modify: `src/components/ui/BottomSheet.tsx`
  - Refactor `installBackdropClickGuard()` so guard listeners are released after the first blocked event.

## Task 1: Make BottomSheet Click Guard One-Shot

**Files:**
- Modify: `scripts/timeline-circle-layout-contract.mjs`
- Modify: `src/components/ui/BottomSheet.tsx`

- [ ] **Step 1: Write the failing contract**

Add assertions to `scripts/timeline-circle-layout-contract.mjs` near the existing bottom-sheet click guard assertions:

```js
assert.match(
  bottomSheet,
  /const fallbackTimer = window\.setTimeout\(clearBackdropClickGuard,\s*(?:1[0-9]{2}|2[0-4][0-9])\)/,
  'bottom sheet backdrop guard fallback should be short enough not to swallow a later intentional tap',
);
assert.match(
  bottomSheet,
  /stopBackdropClickThrough[\s\S]{0,260}clearBackdropClickGuard\(\)/,
  'bottom sheet backdrop guard should release itself immediately after blocking the first retargeted event',
);
assert.doesNotMatch(
  bottomSheet,
  /const guardedEvents = \[[\s\S]*['"](?:pointerdown|touchstart|mousedown)['"]/,
  'bottom sheet backdrop guard must not block the start event of the next intentional tap',
);
```

- [ ] **Step 2: Verify the contract fails before production code changes**

Run:

```bash
npm run check:timeline-circle-layout
```

Expected: FAIL with the fallback timeout or one-shot release assertion.

- [ ] **Step 3: Implement one-shot guard cleanup**

In `src/components/ui/BottomSheet.tsx`, keep the existing `clearBackdropClickGuard()` helper, but change `installBackdropClickGuard()` so `stopBackdropClickThrough()` releases the guard after blocking one event and the fallback timer is short:

```tsx
function installBackdropClickGuard() {
  clearBackdropClickGuard()

  const guardedEvents = [
    'mouseup',
    'click',
    'touchend',
    'pointerup',
  ]
  const guardListenerOptions = { capture: true, passive: false }
  const fallbackTimer = window.setTimeout(clearBackdropClickGuard, 180)
  const stopBackdropClickThrough = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    clearBackdropClickGuard()
  }

  document.documentElement.classList.add('bottom-sheet-click-guard')
  document.addEventListener('click', stopBackdropClickThrough, true)
  guardedEvents.forEach((eventName) => {
    document.addEventListener(eventName, stopBackdropClickThrough, guardListenerOptions)
  })
  clickGuardCleanupRef.current = () => {
    guardedEvents.forEach((eventName) => {
      document.removeEventListener(eventName, stopBackdropClickThrough, guardListenerOptions)
    })
    document.documentElement.classList.remove('bottom-sheet-click-guard')
    window.clearTimeout(fallbackTimer)
  }
}
```

- [ ] **Step 4: Verify the contract passes**

Run:

```bash
npm run check:timeline-circle-layout
```

Expected: PASS.

- [ ] **Step 5: Run targeted validation**

Run:

```bash
npx eslint src/components/ui/BottomSheet.tsx scripts/timeline-circle-layout-contract.mjs
git diff --check -- src/components/ui/BottomSheet.tsx scripts/timeline-circle-layout-contract.mjs
npm run build
```

Expected:
- ESLint exits `0`.
- Diff check exits `0`.
- Build exits `0`; existing chunk/PWA warnings are acceptable if unchanged.

## Self-Review

- Spec coverage: the plan preserves click-through protection, narrows guard lifetime, and avoids MapPage/GPS changes.
- Placeholder scan: no `TBD`, `TODO`, or vague implementation steps remain.
- Type consistency: code uses existing `clickGuardCleanupRef`, `clearBackdropClickGuard`, and native DOM listener patterns already present in `BottomSheet`.
- User constraint: no commit step is included.
