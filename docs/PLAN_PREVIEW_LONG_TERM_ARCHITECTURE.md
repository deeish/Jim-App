# Plan Preview — Long-term architecture plan

This doc describes a **durable** navigation and UI model for workout preview in Plan Preview, replacing reliance on React Native’s global `Modal` and ad hoc focus gating. It complements [PLAN_PREVIEW_MODAL_OVERLAY_INVESTIGATION.md](./PLAN_PREVIEW_MODAL_OVERLAY_INVESTIGATION.md) (short-term mitigations already in code).

**Last reviewed:** 2026-03-25

---

## Why change (recap)

| Issue | Why it hurts long-term |
|-------|-------------------------|
| **`Modal` is app-global** | Can block touches on other tabs even when Plan isn’t “visible”; requires `useIsFocused` + blur clears to stay safe. |
| **Preview state lives in `PlanPreviewScreen`** | Easy to get out of sync with navigation history and deep links. |
| **`ExerciseDetail` back only switches tabs** | Search stack can still sit on `ExerciseDetail`; tapping **Exercises** again may not show the browse list. |

---

## Target architecture (north star)

**Represent the workout preview as a normal navigation surface**, not a global overlay.

### Preferred: dedicated stack screen (modal presentation)

- Add a screen in the **Plan** stack, e.g. `PlanWorkoutPreview` (name TBD), registered in `frontend/src/navigation/PlanStackNavigator.tsx`.
- **Navigate** from the plan week list: `navigation.navigate('PlanWorkoutPreview', { weekNumber, day, workoutId, draftContext… })`.
- Use stack options such as:
  - `presentation: 'modal'` (iOS) / `animation: 'slide_from_bottom'` where appropriate, so it *feels* like today’s sheet without using RN `Modal`.
- **Back** is a single `goBack()` — no cross-tab hacks; the preview’s lifecycle is owned by the Plan stack.

**User impact:** Predictable back behavior, no invisible layer over Exercises, easier a11y and testing.

### Alternative incremental step (smaller PR)

If you need a stepping stone before a new route:

- Replace RN `Modal` with an **absolute-positioned overlay** (`View` with `StyleSheet.absoluteFillObject` or a bottom sheet container) **only inside `PlanPreviewScreen`’s root `View`**, not `Modal`.
- Still tab-scoped; cannot paint above the whole app. You can delete most focus-gating once verified.

**Trade-off:** Less work than a new screen, but state and “back” semantics are still tied to one big screen.

---

## Tab navigator: Android back vs Exercises list

Bottom tabs default behavior can treat **hardware back** as “return to previous tab,” so after **Plan (PlanPreview) → Exercises**, pressing back may send the user to **Plan** again (still on Plan Preview) instead of staying on the browse list.

**Mitigation:** set `backBehavior="none"` on the tab navigator (`frontend/src/components/NavBar.tsx`) so back is handled by the **active stack** (e.g. Search pops `ExerciseDetail` → `SearchList`; on `SearchList` root, back may bubble to the root navigator / exit).

**Extra mitigation (Android):** `SearchScreen.tsx` registers `BackHandler` while focused: at **Search stack root** (`SearchList` only), return `true` so hardware back does **not** bubble (avoids jumping to Plan/PlanPreview). While the saved-exercises sub-panel is open, back closes that panel first.

---

## Secondary fix: Exercises tab + `ExerciseDetail`

**Goal:** After opening an exercise from Plan Preview, **Back** should leave the user in a sensible place: Plan Preview with context restored, and the Exercises tab should show the **browse list** when they tap Exercises (not a stale `ExerciseDetail`).

**Approach (pick one, document in PR):**

1. **After** `tabNav.navigate('Plan', { screen: 'PlanPreview', params })`, call **`navigation.goBack()`** on the Search stack (deferred one frame if needed) so `ExerciseDetail` is popped; or  
2. **`CommonActions.reset`** / **`popToTop`** on the Search navigator for that flow only; or  
3. Navigate to **`SearchList`** explicitly instead of only switching tabs.

Implement whichever matches React Navigation 6 patterns already used in the app; verify on Android hardware back.

---

## Phased implementation plan

### Phase 0 — Lock in behavior (no big refactor)

- [ ] Keep current mitigations from the investigation doc until Phase 1 ships.
- [ ] Add manual test matrix: tab switch with modal, ExerciseDetail back, Exercises tab shows list.

### Phase 1 — `ExerciseDetail` → Plan return (navigation correctness)

**Files (expected):** `frontend/src/screens/ExerciseDetailScreen.tsx`, possibly `frontend/src/types/navigation.ts`.

- [x] When `returnToPlanPreview` is true, after switching to Plan / PlanPreview params, **pop** Search stack (`setTimeout` + `navigation.goBack()`) so Exercises shows `SearchList`.
- [ ] Retest: open exercise from Plan Preview → back to plan → tap Exercises → **list**, not stuck on detail.

### Phase 2 — Remove global `Modal` from Plan Preview

**Files:** `frontend/src/screens/PlanPreviewScreen.tsx` (major trim), styles.

- [ ] Either:
  - **2a (incremental):** Replace `<Modal>` with in-screen overlay `View`; remove `visible={… && isFocused}` if redundant; keep blur cleanup only if still needed; or  
  - **2b (preferred):** Move preview UI into new screen component and delete modal/overlay from `PlanPreviewScreen`.

### Phase 3 — New `PlanWorkoutPreview` screen (north star)

**Files:** new screen module, `PlanStackNavigator.tsx`, `frontend/src/types/navigation.ts`, `PlanPreviewScreen.tsx` (navigate instead of local state).

- [ ] Define params: `weekNumber`, `day`, `workoutId`, plus anything needed to load draft vs Groq preview (or pass a stable `sessionKey` / snapshot).
- [ ] Move preview body (exercises list, replace, alternate preview, reasoning) into the new screen or a shared component used only there.
- [ ] From exercise rows inside preview, navigate to `ExerciseDetail` in Search tab; on back, use Phase 1 behavior + optional `returnToPlanCard` → now **`navigate('PlanWorkoutPreview', params)`** instead of reopening modal state.
- [ ] Remove `returnToPlanCard` from `PlanPreview` route params if nothing else needs it, or narrow types.

### Phase 4 — Cleanup & docs

- [ ] Update [PLAN_PREVIEW_MODAL_OVERLAY_INVESTIGATION.md](./PLAN_PREVIEW_MODAL_OVERLAY_INVESTIGATION.md) with “superseded by …” or archive.
- [ ] Update this file’s checkboxes and **Last reviewed**.
- [ ] Add a line to [INDEX.md](./INDEX.md) pointing here.

---

## Screen / component change summary

| Area | Current | Long-term |
|------|---------|-----------|
| Plan week list + tap card | Local state opens `Modal` | `navigation.navigate('PlanWorkoutPreview', …)` |
| Preview UI | Inside `Modal` in `PlanPreviewScreen` | Dedicated screen or shared `PlanWorkoutPreviewContent` |
| Focus / blur hacks | `useIsFocused`, clear state on blur | Unnecessary for stack screen; optional for incremental overlay |
| Exercise from preview | Cross-tab + `returnToPlanCard` on `PlanPreview` | Same cross-tab idea, but return target is **`PlanWorkoutPreview`** params |
| ExerciseDetail back | Tab switch to Plan only | Tab switch + **pop Search stack** |

---

## Risks

- **Parameter payload size:** Passing full `planInputs` / draft snapshots in params can be heavy; prefer IDs + read from in-memory store or a small context if needed.
- **Deep linking:** A dedicated screen makes “open plan preview for week 2 Wednesday” easier later; document param contract.
- **Regression surface:** Move UI in small commits (extract component first, then route).

---

## Definition of done (long-term)

1. No React Native `Modal` for Plan workout preview.
2. Exercises tab never blocked by Plan preview UI.
3. Back from `ExerciseDetail` (opened from plan flow) returns to Plan preview context **and** Exercises tab shows browse list when selected.
4. Manual tests on iOS + Android (tab bar + hardware back).
