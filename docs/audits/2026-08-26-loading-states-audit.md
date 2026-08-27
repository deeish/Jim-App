# Loading states — audit, 2026-08-26

**Question asked:** for every page, and every element on it, do we show a **loading skeleton** while data is in flight — or something else?
**Scope:** all 26 screens in `frontend/src/screens/`, plus components that fetch independently of a screen. Frontend only.
**Method:** every claim below was read out of the file it cites. Where a state could not be reproduced it is marked *latent*, not asserted.

---

## Verdict

**The primitive exists and is good — `frontend/src/components/Skeleton.tsx` (`Skeleton`, `SkeletonCard`, `SkeletonList`, real shimmer at `:39-50`) — but only 7 of 26 screens import it (~27%):** Home, Progress, Templates, TemplateDetail, SavedWorkouts, ExerciseDetail, PlanCalendarWeek.

Roughly two-thirds of data-bearing screens have *some* deliberate treatment. The remaining third render nothing or, worse, render their **empty state** — which does not merely look unfinished, it states something false about the user's data.

Quality is bimodal. `ProgressScreen` is the reference implementation (skeleton on cold load, stale content kept on refetch, empty state reachable only after a settled successful fetch — the reasoning is written out at `:41-46, 81-83, 113-116`). At the other end, `ProfileScreen` and `PlanCalendarWorkoutCompleteScreen` contain **no loading flag at all**.

---

## Treatment by screen

Categories: **SKELETON** · **SPINNER** · **NOTHING** (renders null) · **EMPTY-STATE** (shows the no-data copy during load — actively misleading) · **STALE** · **N/A**.

| Screen | What loads | Treatment | Where |
|---|---|---|---|
| App root | session + prefs hydration | Branded splash, gates the nav tree | `App.tsx:102`, `:188-190` |
| HomeScreen | plan, weekly workouts, stats | SKELETON — ~~one card~~ → **3 regions, `52b3a76`** | `HomeScreen.tsx:439-442` |
| CalendarScreen (History) | month's logs | SPINNER + **per-cell placeholder dots, `52b3a76`** | `CalendarScreen.tsx:286-291` |
| ProgressScreen | workout stats | **SKELETON** ✅ reference | `ProgressScreen.tsx:84-93` |
| TemplatesScreen | template list | SKELETON | `TemplatesScreen.tsx:66-76` |
| TemplateDetailScreen | one template | SKELETON | `TemplateDetailScreen.tsx:149-157` |
| SavedWorkoutsScreen | saved + current plan | SKELETON, **no longer re-flashes on focus, `ba7b055`** | `SavedWorkoutsScreen.tsx:157-158` |
| ExerciseDetailScreen | exercise + saved ids | SKELETON + **history card reserved, `52b3a76`** | `ExerciseDetailScreen.tsx:526-539` |
| PlanCalendarWeekScreen | calendar store | **SKELETON** ✅ distinguishes `'loading'` from `'empty'` | `:255-262`, guard `:432` |
| PlanCalendarMonthScreen | same store | ~~EMPTY-STATE~~ → **fixed** `fd46bce` | `:479-485` |
| PlanCalendarDayScreen | same store | ~~EMPTY-STATE~~ → **fixed** `fd46bce` | `:448-453` |
| PlanCalendarWorkoutScreen | exercise history for the deck | ~~NOTHING~~ → **row reserved, `cf1452d`** | `:170-189`, `:691`, `:693` |
| PlanCalendarExercisePickerScreen | suggestions | Text placeholder, space reserved ✅ | `:270-279` |
| PlanCalendarWorkoutCompleteScreen | celebration baselines | ~~NOTHING~~ → **auto-advance waits, `de998d1`** | `:305`, `:1015-1075` |
| CrewScreen | crew summary | SPINNER + **create/join ordering fixed, `fdff354`** | `CrewScreen.tsx:733-736` |
| ProfileScreen | 3 fetches, 2 sequential | ~~NOTHING + EMPTY-STATE~~ → **fixed** `f7d9a3c` | `:557-559`, `:593-637`, `:1154-1158` |
| SearchScreen | saved-exercise list | SPINNER, guarded ✅ | `SearchScreen.tsx:580-583` |
| ↳ ExerciseLibrary | exercise search | SPINNER ✅; ~~one empty frame~~ → **fixed `ba7b055`** | `:1630-1633`, `:909` |
| WorkoutDetailScreen | workout + plan | SPINNER; ~~empty-state frame~~ → **fixed `ba7b055`** | `:394-401`, `:50` |
| WeightTrackerScreen | a year of weigh-ins | ~~SPINNER~~ → **SKELETON, `52b3a76`** | `:261-264` |
| ShareRedeemScreen | code lookup | SPINNER | `:458-461` |
| GeneratePlanScreen | AsyncStorage only | BenchPressLoader; ~~EMPTY-STATE~~ → **fixed `ba7b055`** | `:1072-1082`; `:2068-2069` |
| PlanPreviewScreen | the Groq generation | Full-screen loader ✅ + **Apply gated, `cf1452d`** | `:1093-1104`, `:1679-1704` |
| OnboardingScreen | local state | N/A; payoff card has a card-shaped spinner ✅ | `:382-385` |
| Login / Signup / Forgot / SetNewPassword | submit only | N/A — in-button spinner | `LoginScreen.tsx:119` |

---

## Empty-state offenders — these state falsehoods

- [x] **1. PlanCalendarDayScreen — "Rest day — nothing scheduled."** — **fixed `fd46bce`**
- [x] **2. PlanCalendarMonthScreen — "No active plan yet — start with Planning above"** — **fixed `fd46bce`**

  Both were the *default* path, not an edge case. `baseDayForDate` (`planCalendarPrototypeStore.ts:611`) falls through to `{ title: 'Rest Day', exercises: [] }` for any unresolved date, so an unanswered fetch and a genuinely open day were indistinguishable. `calendarDataMode()` has reported `'loading'` the whole time — Month referenced it **zero** times, and Day used it only for `'live'` and `'offline'`.

  ⚠ **And it was reproducible on demand.** `refreshLiveCalendarData(true)` resets `liveStatus = 'idle'` (`:360`), and `'idle'` reads as `'loading'` (`:602-606`). Both Month (`:278`) and Week (`:140`) pass `true` on pull-to-refresh — **so pulling down on your own calendar made your plan evaporate into "no active plan yet."**

  The fix was already written in the same feature: `PlanCalendarWeekScreen.tsx:432` gates the identical message on `mode === 'empty'` and shows skeletons for `'loading'`.

  ⚠ **The lede needed it too, and only a screenshot caught that.** `PlanCalendarDayScreen.tsx:336` renders `${pPlan.title} · ${date} · ${n} exercises`, which read **"Rest Day · Aug 26 · 0 exercises"** one line above the card that had just been fixed. A text assertion for `"Rest day"` walked straight past it on the capital D. *Lesson: assert case-insensitively, and look at the picture.*

**All closed except the latent one:**

- [x] **3. ProfileScreen — "Body weight — Not set"** to a user with years of weigh-ins — **fixed `f7d9a3c`**
  The row existed *because* the band collapses to `weightRow` on empty data (`profileBand.ts:50-66`), so it both lied and then vanished out from under a finger when data landed. Replayed on **every** open, Profile being a pushed screen that unmounts on back (`App.tsx:173`).
  One `bandLoading` flag held until all three fetches settle fixes the lie *and* the triple reflow — they were the same bug seen twice. Two skeleton cards stand in for both slots, because which slot gets which card is itself decided by data that hasn't arrived. `allSettled`, not `all`: one failed request must still reveal a band built to degrade.
  ⚠ Profile still unmounts on back, so each open shows a brief skeleton rather than stale content. That is honest where "Not set" was not, but it is not free — a cached band across mounts would be the next step if it grates.
- [x] **4. GeneratePlanScreen — "No saved splits yet."** before the AsyncStorage read returns. `:2068-2069`
- [x] **5. CrewScreen — create** closes the sheet *before* `await load()` (`:177-179`), so you watch the "start a crew" empty state while your new crew is fetched.
- [x] **6. CrewScreen — join** button label is unconditionally `"Join"`; `busy` reaches `disabled` only (`:806-815`). Two round trips, no feedback.
- [x] **7. WorkoutDetailScreen** — one painted frame of "No workout selected" because `loading` inits `false` (`:50`).
- [x] **8. ExerciseLibrary** — one frame of "No exercises to show", same cause (`:909`).
- [ ] **9. PlanCalendarWorkoutComplete** *(latent, still open)* — on a cold store: "Rest Day" subtitle, "0 sets", and **"cut short still counts"** over a completed session. ⚠ Reachability unconfirmed; the day screen normally primes the store first.

---

## Element pop-ins, most jarring first

1. ~~**Profile's athlete band inserts 150–300px mid-scroll.**~~ **Fixed `f7d9a3c`** — best-lifts (`:847-883`), weight card + 12 bars (`:891-954`) and lifts strip (`:956-976`) each rendered `null` until their own request returned, and best-lifts is **two sequential round trips** (`:618` then `:627`), so the page reflowed up to three times. The band now arrives once.
2. **The finish screen's streak pill and PR cards may never appear.** `celebrationBaselines` is fetched *after* `navigation.navigate` (`PlanCalendarDayScreen.tsx:566-573`), the pill renders nothing while pending, and the poster auto-advances at `AUTO_ADVANCE_MS = 2800`. A slow response silently skips the user's PR — on the one screen whose whole purpose is the payoff.
3. **Home's page body is promised by one small card.** `SkeletonCard lines={3}` (`:442`) stands in for the hero, the 7-tile week strip (`:694`), two momentum tiles (`:749`), the recap (`:798`) and the quick-workout row (`:824`). The page roughly quadruples in height.
4. **PlanPreview regeneration hides a 30–60s AI call behind a 20pt spinner** (`:1246-1280`); the week stays stale, undimmed and interactive.
5. **The live set deck's Target and "Last time" change under the user** mid-set (`PlanCalendarWorkoutScreen.tsx:170`, `:691`, `:693`).
6. ExerciseDetail's "Your history" card pops in below the fold (`:129-143`, `:672`).
7. History calendar day badges — every day reads untrained until the fetch lands (`CalendarScreen.tsx:337`), re-entered on every month switch.
8. SavedWorkouts re-flashes its skeleton on **every** focus — `setLoading(true)` runs unconditionally (`:73-78`), unlike Progress/Home which keep content on refetch.

---

## Priority

**Done:** calendar Day + Month (above).

**All done as of 2026-08-26** — every item below was closed in `ba7b055`, `fdff354`,
`de998d1`, `52b3a76`, `cf1452d`. Verified by stalling **every** `/api/**` call for 20s and
sweeping Home, Calendar (week/month/day), Crew, Exercises and Profile: **zero** instances of
any of the six lying strings, everything resolved afterwards, no page errors.

1. ~~ProfileScreen athlete band~~ — **done, `f7d9a3c`**.
2. **Extend Home's skeleton** — the primitive is already imported; add the week strip and momentum tiles so the page stops quadrupling.
3. **Finish-screen ordering** — `await primeCelebrationBaselines` *before* navigating, or hold the auto-advance. Not a skeleton; a 2.8s poster with a shimmer would be worse than the wait.
4. **PlanPreview regeneration** — dim the week and overlay "Rebuilding week 3…".
5. **Two-character fixes:** `useState(false)` → `useState(true)` at `WorkoutDetailScreen.tsx:50` and `ExerciseLibrary.tsx:909`.
6. **Crew ordering:** move `setCreateSheetOpen(false)` after `await load()`; put `busy` into the Join label.

**Cheap wins**
- `WeightTrackerScreen` — one `SkeletonCard` beats a bare centred spinner for a card + 30-bar chart with a fixed shape.
- `CalendarScreen` — grey dots per cell during `logsLoading`, so the month doesn't read as "you trained nothing".

**Do not bother**
- The four auth screens — no data loading; the in-button spinner is correct.
- OnboardingScreen — pure local state, and its one fetch is prefetched with a card-shaped spinner already.
- Anything behind `UserPreferencesContext` — `App.tsx:102` blocks the navigator until `hydrated`, so prefs never flash. (Exception: an account switch resets `hydrated=false` at `UserPreferencesContext.tsx:257` — code-read inference, unconfirmed.)
- `PlanCalendarExercisePicker`'s rail — "Finding recommendations…" already reserves the space; a shimmer would be a downgrade from a specific label.
- Action spinners generally (`WorkoutMoveSheet`, `LogWeightSheet`, hearts, `ShareModal`, Replace, Apply to Plan). User-initiated, no shape to promise — `Skeleton.tsx:20-22` states this rule and the code follows it.

---

## One non-skeleton finding worth its own fix

**`PlanPreviewScreen.tsx:1679-1704`** — the "Apply to Plan" button renders **outside** the `!loadingPreview` gate. For the entire 1–2 minute generation a full-colour primary button sits on screen, `disabled` but with **no disabled styling**, silently swallowing taps. That reads as broken far more than a missing skeleton does.
