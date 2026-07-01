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

- **Normalize first (this is also a perf fix — see below):** at the top of
  `performSearch`, when `filters.equipment.length === EQUIPMENT_OPTIONS.length`
  treat equipment as NOT set (don't send it, don't count it). All-selected
  then falls into the browse branch: capped at 300, "Popular exercises"
  header. State in `filters.equipment` stays full so the Equipment Available
  checkboxes and its All badge are unchanged.
- **Active-filters row** shows ONE summary chip for equipment instead of one
  chip per item:
  - all equipment selected → no chip at all (it isn't narrowing anything)
  - selection equals the profile set → `My equipment · 8` — the label
    explains *why* results are filtered, which prevents "where is exercise X"
    confusion and makes the × decision safer
  - any other subset → `Equipment · 5`
  - Tapping the chip body expands the Equipment Available section (set
    `showEquipment(true)`) so it is obvious where to adjust. The chip's ×
    clears the equipment narrowing (select all).
- **Header badge** counts equipment as ONE active filter when narrowed, ZERO
  when all selected. Muscle/sub-muscle/movement chips keep counting
  individually. (Update `getActiveFilterCount` and `getActiveFilters`.)
- **Reset disabled-state:** today Reset greys out when the badge count is 0.
  After this change a subset-profile user (home gym) sits at badge 1 in their
  *default* state, so Reset would look enabled while doing nothing. Disable
  Reset when filters equal the default state (empty text, no muscle/movement
  chips, equipment set-equal to `profileEquipment`), not when the count is 0.

**Why the normalization matters beyond looks — two real fixes:**

1. **The default load is currently uncapped.** Browse-first's `limit` only
   protects the zero-chip case; an all-gear user's seeded state takes the
   filtered branch with no limit and pulls essentially the whole 5000-row
   catalog on every visit, then groups it on the JS thread. Normalizing
   all-selected into browse mode caps the default load at 300.
2. **All-selected currently hides gear-less exercises.** Up to 8 catalog rows
   have `"equipmentIds": []` (`backend/data/exercises_5000plus.json`), and the
   backend matches with `.some(...)`, so they never match any equipment
   selection. Omitting the param un-hides them.

**Recommended while in there:** send `limit: 300` on ALL chip-driven searches
(not just browse-all), and reuse the "top N of total" subtext when
`count > exercises.length`. Nobody scrolls past 300 popularity-sorted rows,
and it bounds the payload for subset-equipment users (Dumbbell + Bodyweight
alone matches thousands). Keep text search uncapped — it is relevance-ranked
and a capped name match would be confusing.

**Files:** `frontend/src/screens/SearchScreen.tsx` (`performSearch`,
`getActiveFilters`, `getActiveFilterCount`, `resetFilters`, active-chips row
render), `frontend/src/constants/equipment.ts` (EQUIPMENT_OPTIONS length
reference).

**Verify:** fresh load with full profile equipment → NO equipment chips, badge
absent, "Popular exercises" header, response capped at 300; uncheck 4 items in
Equipment Available → one `Equipment · 8` chip appears, badge shows 1; restore
your profile set → chip reads `My equipment · …`; tap the chip → section
expands; tap × → back to all; Reset is greyed out on a fresh load for both
all-gear and home-gym profiles.

## 4. SMALL — polish items, do opportunistically

- **Merge the two collapsible rows.** "Equipment Available" and "Advanced
  Filters" are separate ~60px rows for rarely-touched controls; together with
  margins they push the first result a full card lower. Fold both into ONE
  "More filters" collapsible row (equipment chips + movement patterns inside).
  This halves the remaining pre-results furniture without committing to the
  full bottom-sheet refactor (PR 5), and pairs well with item 3's tap-to-expand
  target.
- **Slim the Refine card to an inline chip row.** Tapping a muscle chip is the
  moment the user most wants results, but today it *adds* a ~110px boxed
  "Refine Chest" card (padding, border, title row) between the filters and the
  list. Keep the sub-muscle chips, drop the card chrome: render them as a
  plain second chip row directly under the muscle row, with the existing
  "All chest · tap to narrow" copy as a small caption or removed entirely.
  (`RefineSection` + `refineSection` styles in `SearchScreen.tsx`.)
- **Dim the chips row while a search term is active.** Text search
  deliberately ignores chips so a typed name is never hidden — but the active
  chips still render at full strength while typing, and with item 3 a
  "My equipment" chip would imply gear filtering that is not being applied.
  When `searchQuery` is non-empty, drop the active-chips row to ~40% opacity
  (optionally with a "not applied while searching" caption) so the UI stops
  claiming filters it is not using.
- **Results header vs error:** after item 2, the "Popular exercises / N
  found" header reappears correctly. Consider a "Retry" button on the error
  card (re-run `performSearch(filters)`) instead of requiring a filter change.
- **Muscles & cardio helper text** ("Pick a group, or tap Cardio…") is a full
  line of permanent copy for a control that explains itself after first use.
  Candidate for removal when the filter area slims down — fine to leave until
  then.
- **PR 5 (filter bottom sheet)** stays deferred. With browse-first live and
  the two rows merged, the remaining furniture is one chip row + one
  collapsible row + search — a bottom sheet may no longer be worth its
  regression risk in the add-to-plan flows. Decide after using the app with
  items 1–3 fixed.

---

**Suggested order for tomorrow:** 1 (env/deploy check, no code) → 2 (small,
prevents confusing states while testing) → 3 (the visible win AND the default-
load perf fix) → 4 as time allows. Items 2–4 are frontend-only; nothing here
requires a schema or API change beyond what round 1 already added.

---

## Acceptance walkthrough (run after items 1–4, on device, dark + light)

Verify journeys, not just features:

1. **Fresh all-gear user:** open Exercises → results visible without scrolling
   past more than the chip row + one collapsible row; "Popular exercises"
   header; no active-filter chips; Reset greyed out. Tap Chest → results
   narrow, sub-muscle chips appear inline WITHOUT pushing results down a full
   card; tap Upper Chest → narrows further; badge counts are sane throughout.
2. **Home-gym user (subset profile):** fresh load shows `My equipment · N`
   chip and Reset greyed; × the chip → full catalog; Reset → back to profile
   gear, chip returns, Reset greys out again.
3. **Search overrides chips:** with Chest + equipment active, type "deadlift"
   → deadlifts appear (chips visibly dimmed); clear the search (× in the
   field) → previous chip-filtered results return, chips back to full
   strength.
4. **Add-to-plan roundtrip:** Plan → add exercises → select two rows
   (checkmarks + footer count), open one row's info button and come back
   (selection intact), confirm add, land on Plan with the slot created.
   Android hardware back mid-flow must not exit to the wrong tab.
5. **Failure path:** airplane mode → open tab → error card with Retry;
   restore network → Retry loads the catalog; no error-and-results shown
   together at any point.

If all five pass, this page is in a defensible 1.0 state; the only remaining
structural candidate is PR 5, and it should be re-justified against journey 1
before being built.
