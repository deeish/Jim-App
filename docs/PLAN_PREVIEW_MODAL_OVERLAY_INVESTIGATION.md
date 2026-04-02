# Plan Preview Modal Overlay — Investigation & Fix Plan

This document is the **working plan** to get Plan Preview ↔ Exercises navigation correct. For the long-term “north star” (dedicated stack screen, no RN `Modal`), see [PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md](./PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md).

---

## Symptoms (two different bugs)

Users can see **either** or **both** of the following. Treat them separately when debugging.

| Symptom | Likely cause |
|--------|----------------|
| **Exercises tab still shows the same exercise detail** (“stuck on the workout I tapped”) | **Search stack state**: `ExerciseDetail` remains on top of the Search stack. Switching tabs does not pop that screen. |
| **Exercises shows the list but taps/scroll don’t work, or a dim layer covers the app** | **Global `Modal`**: React Native `Modal` is not tab-scoped; if `visible` is true or focus gating fails, it can sit above the whole app. |

Fixing only the modal will **not** fix being stuck on `ExerciseDetail`. Fixing only the Search stack will **not** fix overlay blocking if `Modal` stays visible.

---

## Desired behavior

1. On **Exercises / Search**, the user always sees the **browse list** when that is the right surface—not a stale `ExerciseDetail` left over from the plan flow.
2. While on **Exercises**, the Plan workout preview must **not** be visible and must **not** intercept touches (no global overlay).
3. When the user **backs out of `ExerciseDetail`** into the plan flow, **Plan Preview** should reopen the **same** workout card (week / day / workout), via `returnToPlanCard` (or future equivalent params on a dedicated preview screen).

---

## Root causes (confirmed model)

1. **`Modal` is app-global** — `visible` is not limited to the Plan tab; `PlanPreviewScreen` staying mounted keeps preview state alive across tab switches.
2. **Cross-tab navigation does not reset the peer stack** — Opening `ExerciseDetail` in the Search stack and then focusing Plan leaves Search history intact unless something **explicitly** resets or pops to `SearchList`.
3. **`useIsFocused()` is a mitigation, not a guarantee** — Nested navigators can make focus behavior subtle; relying on it alone for a global `Modal` remains brittle.

---

## Correct plan (do in order)

### Phase A — Lock navigation correctness (Search stack)

**Goal:** After any “plan preview → exercise row → `ExerciseDetail` → return to plan” flow, choosing the **Exercises** tab shows **`SearchList`**, not `ExerciseDetail`.

**Actions:**

1. **Inventory all entry paths** into `ExerciseDetail` from Plan Preview (modal exercise rows, deep links later, etc.). Every path that uses `returnToPlanPreview` / `planPreviewParams` must end up with a consistent stack reset when the user is done with that flow—not only the in-screen back button.
2. **Verify `resetSearchStackToSearchList`** in `frontend/src/screens/ExerciseDetailScreen.tsx` actually finds the navigator whose `routeNames` include `SearchList` and `ExerciseDetail`. If the tree changes (wrappers, nested groups), the parent walk may silently no-op and the bug persists.
3. **Cover alternate exits**: tab switch while on `ExerciseDetail`, Android hardware back, gestures. If the user reaches Plan without going through `handleBack`, decide whether to reset Search when **Plan tab gains focus** from that flow (e.g. listener / param flag) or document that only “Back to plan” clears the stack—then fix if UX requires tab switches to also recover.
4. **Optional hardening** (pick one pattern and stick to it): `popToTop` on the Search stack, `CommonActions.reset` keyed to the Search navigator, or explicit `navigate('Search', { screen: 'SearchList' })` after a cross-tab jump—aligned with React Navigation 6 docs and existing app patterns.

**Reference:** Tab/back behavior notes in [PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md](./PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md) (Search stack, `backBehavior`).

### Phase B — Modal visibility and focus (mitigation while `Modal` remains)

**Goal:** Never block the other tab’s touches because of Plan’s workout modal.

**Actions:**

1. Keep **presentation** gated so the overlay is only “live” when Plan Preview is the focused route, e.g. `visible={!!previewCard && isFocused}` (already applied—re-verify on devices).
2. Keep **defensive** blur/unfocus cleanup of `previewCard` / `previewData` / `previewLoading` if focus is unreliable—but prefer Phase C to remove the class of bug.
3. Retest the matrix below; add logging in dev if `resetSearchStackToSearchList` or modal `visible` ever disagree with what you see on screen.

### Phase C — Stop using global `Modal` for workout preview (structural)

**Goal:** Remove reliance on `Modal` + focus hacks.

**Direction:** Dedicated **Plan stack** screen (e.g. `PlanWorkoutPreview`) with modal-style presentation, **or** an absolute-fill overlay **inside** `PlanPreviewScreen` only—not `<Modal>`. See Phase 2 / 3 in [PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md](./PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md).

After Phase C, “Exercises blocked by Plan overlay” should disappear by design; Phase A remains important so the Exercises tab is never stuck on detail.

---

## Architecture snapshot (reference)

- Bottom tabs: `frontend/src/components/NavBar.tsx`
  - **Plan:** `frontend/src/navigation/PlanStackNavigator.tsx` → `PlanPreview`, etc.
  - **Search:** `frontend/src/navigation/SearchStackNavigator.tsx` → `SearchList`, `ExerciseDetail`
- **PlanPreviewScreen:** `frontend/src/screens/PlanPreviewScreen.tsx` — workout preview in RN `Modal` (today).
- **ExerciseDetailScreen:** `frontend/src/screens/ExerciseDetailScreen.tsx` — `returnToPlanCard`, tab `navigate` to Plan, `resetSearchStackToSearchList` after switch (today).

---

## Changes already applied (baseline)

1. **Reopen exact card:** `returnToPlanCard` on `PlanPreview` / `ExerciseDetail` params; `PlanPreviewScreen` passes it from modal rows; `ExerciseDetailScreen` forwards it when switching back to Plan.
2. **Modal mitigation:** `visible={!!previewCard && isFocused}` and blur-style clearing when unfocused on `PlanPreviewScreen`.
3. **Search stack reset:** `resetSearchStackToSearchList` + `setTimeout(..., 0)` after navigating to Plan from `ExerciseDetail` `handleBack` when `planPreviewParams` is set.
4. **Phase A.3 (tab / any leave):** `ExerciseDetailScreen` uses `useFocusEffect` cleanup so when `returnToPlanPreview` is true and the detail screen **loses focus** (other tab, etc.), the Search stack resets to `SearchList`—not only when Back runs.
5. **Dev visibility:** `resetSearchStackToSearchList` logs a `console.warn` in `__DEV__` if no matching navigator is found.
6. **Swap modal (Phase B):** `visible={swapModalVisible && isFocused}`; unfocus effect also calls `setSwapModalVisible(false)`.

**If behavior is still wrong:** use the symptom table at the top to determine whether Phase A (stack), Phase B (modal), or a failed `resetSearchStackToSearchList` walk is the next fix.

---

## Acceptance tests (manual)

### A — Search stack / “stuck on workout”

1. Plan Preview → open workout modal → open an exercise → **Back** to Plan → confirm card reopens.
2. Then tap **Exercises**: must show **`SearchList`**, not `ExerciseDetail`.
3. Repeat but switch to **Exercises** from Plan **before** Back (if still on `ExerciseDetail`): define expected behavior, then confirm stack matches (may require Phase A.3).
4. Android hardware back through the same flow; repeat step 2.

### B — Modal / overlay

1. Plan Preview → open modal only → switch to **Exercises** (no `ExerciseDetail`): list must scroll/tap immediately.
2. With modal open and **loading** (`previewLoading`), switch tabs: other tab must not be blocked.
3. Plan → modal → exercise → Back → Plan → switch **Exercises**: passes both A.2 and no invisible overlay.

### C — Regression

- [ ] `npm run lint` / `tsc --noEmit` in `frontend` clean.
- [ ] iOS + Android: tab bar and hardware back.

---

## Residual risks

- **`resetSearchStackToSearchList` fails silently** if navigator hierarchy changes—add a dev warning if no matching parent is found after N levels.
- **`returnToPlanCard` / `planDraft` timing:** brief flash or empty state if draft is not ready; acceptable if short.
- **Focus edge cases** until Phase C ships: rare devices/navigator configs where `useIsFocused` does not match user’s idea of “on Plan tab.”

---

## Doc maintenance

When Phase C lands and RN `Modal` is removed from this flow, update this file to point at the new screen name and trim Phase B; keep Phase A checklist for any future cross-tab detail flows.
