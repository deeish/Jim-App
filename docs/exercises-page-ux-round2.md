# Exercises Page — UX Round 2 (follow-ups from 2026-07-01 screenshot review)

Round 1 (branch `feat/exercises-ux`) shipped compact rows, browse-first, the
All | Saved segment, server-side grouping, and the icon/polish pass. A device
screenshot review on 2026-07-01 confirmed the layout works and surfaced the
items below. Ordered by priority; each is small and independently shippable.

---

## 1. BUG — "Request failed with status code 400" on browse (fix first)

**Symptom:** red Error card above results; also bench-press equipment variants
show as separate rows instead of one family with a "1 variant" toggle.

**Cause:** the app was talking to a backend *without* this branch's changes.
The new frontend sends `limit` on the no-filter browse request, and the global
`ValidationPipe` uses `forbidNonWhitelisted: true` (`backend/src/main.ts`), so
an old backend rejects the unknown `limit` property with 400. The missing
variant-merging has the same cause: an old backend sends no `groupKey`, so the
frontend falls back to exact-name grouping (by design).

**Actions:**
- When testing on device, run the backend from this branch (`cd backend &&
  npm run start:dev`) and point `EXPO_PUBLIC_API_BASE` at it — not at the
  deployed Render backend.
- **Release order rule:** deploy the backend BEFORE shipping the frontend
  build / OTA update. The new backend is fully compatible with the old
  frontend (extra `groupKey` field is ignored; `limit` is optional), but the
  new frontend 400s against the old backend.

**Verify:** cold-load the Exercises tab with no chips → "Popular exercises"
list, no error; "Flat Barbell Bench Press" and "Flat Dumbbell Bench Press"
appear as ONE row with a variants toggle.

## 2. BUG — stale search responses can overwrite fresh ones

**Symptom in screenshot:** Error card AND valid results shown at the same
time. The error also suppresses the results header (it renders only when
`!error`).

**Cause:** `performSearch` (`frontend/src/screens/SearchScreen.tsx`) has no
in-flight guard. Two overlapping requests can resolve out of order: a slow
failing request (e.g. the 400 above) lands *after* a later successful one and
overwrites state — stale error over fresh results, or stale results over
fresh ones while typing quickly.

**Fix:** module-level request sequence counter.

```ts
const requestSeq = useRef(0);
const performSearch = useCallback(async (currentFilters: FilterState) => {
  const seq = ++requestSeq.current;
  ...
  const response = await searchExercises(searchParams);
  if (seq !== requestSeq.current) return; // stale response — a newer search is in flight
  ...same in catch: if (seq !== requestSeq.current) return;
  ...in finally: only setIsLoading(false) when seq === requestSeq.current
```

**Verify:** type quickly while throttling the network; results and error state
always match the LAST keystroke; error card and results never show together.

## 3. FEATURE — one "equipment" summary chip instead of 12 chips (Dylan's proposal — agreed)

**Problem:** profile-seeded equipment fills the active-filters row with up to
12 removable chips and drives the header badge to "12", which reads as heavy
filtering when it actually means "all my gear" (no effective narrowing). The
same state is already shown in the Equipment Available row's All/N-of-M badge,
so today it appears in three places.

**Design:**

- **Active-filters row** shows ONE summary chip for equipment instead of one
  chip per item:
  - all equipment selected → no chip at all (it isn't narrowing anything)
  - subset selected → `Equipment · 5`
  - Tapping the chip body expands the Equipment Available section (set
    `showEquipment(true)`; optionally scroll to it) so it is obvious where to
    adjust. The chip's × clears the equipment narrowing (select all).
- **Header badge** counts equipment as ONE active filter when narrowed, ZERO
  when all selected. Muscle/sub-muscle/movement chips keep counting
  individually. (Update `getActiveFilterCount` and `getActiveFilters`.)
- **Equipment Available row** stays the single place to toggle individual
  items; its All / `N/12` badge is unchanged.

**Bonus correctness fix while in there:** 8 catalog rows have NO equipment at
all (`"equipmentIds": []` in `backend/data/exercises_5000plus.json`). Because
the backend matches with `.some(...)`, "all 12 selected" currently *hides*
those 8 rows, so all-selected is not the same as unfiltered. When
`filters.equipment.length === EQUIPMENT_OPTIONS.length`, omit `equipment` from
the request payload entirely (in `performSearch`). That makes the default
seeded state identical to true browse mode and un-hides those rows.

**Files:** `frontend/src/screens/SearchScreen.tsx` (`getActiveFilters`,
`getActiveFilterCount`, `performSearch`, active-chips row render),
`frontend/src/constants/equipment.ts` (EQUIPMENT_OPTIONS length reference).

**Verify:** fresh load with full profile equipment → NO equipment chips, badge
absent/0, results identical to browse-all; uncheck 4 items in Equipment
Available → one `Equipment · 8` chip appears, badge shows 1; tap the chip →
section expands; tap × → back to all.

## 4. SMALL — polish items, do opportunistically

- **Results header vs error:** after item 2, the "Popular exercises / N
  found" header reappears correctly. Consider a "Retry" button on the error
  card (re-run `performSearch(filters)`) instead of requiring a filter change.
- **Muscles & cardio helper text** ("Pick a group, or tap Cardio…") is a full
  line of permanent copy for a control that explains itself after first use.
  Candidate for removal when the filter area slims down — fine to leave until
  then.
- **PR 5 (filter bottom sheet)** stays deferred. With browse-first live, the
  filter stack above the fold is the remaining structural weight; decide after
  using the app with items 1–3 fixed.

---

**Suggested order for tomorrow:** 1 (env/deploy check, no code) → 2 (small,
prevents confusing states while testing) → 3 (the visible win) → 4 as time
allows. Items 2 and 3 are frontend-only; nothing here requires a schema or
API change beyond what round 1 already added.
