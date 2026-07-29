# Progress & history — make the logging pay off

**Date:** 2026-07-27
**Branch context:** `main` (clean; 265 frontend + 470 backend tests green at `95f86d3`)
**Status:** **All four phases implemented (2026-07-28).** See §0 for what shipped and what is still open. The analysis below is kept as written — the traps in §3 are why the implementation looks the way it does.

Written 2026-07-27 against live code and a full local run-through (onboarding → generate → apply → live session → 17 logged sets → finish → history). **Verified across four passes the same day.** Pass 2 changed the approach in four places and added three missed risks; pass 3 found the pass-2 PR recommendation was itself wrong and that no index supports these queries (§3.7); pass 4 found a real Phase 3 bug (the `'manual'` guard divergence, §3.4) and **retracted an incorrect criticism of its own** (the finish-screen green button is on-palette, §4 Phase 1). No branch, no stash, no prior design doc.

---

## 0. Implementation status (2026-07-28)

**Phase 0** — `feat/progress-stats-endpoints`, open as **draft PR #24**.
**Phases 1–3** — `feat/progress-finish-screen`, stacked on that branch.

| Phase | What landed |
|---|---|
| 0 | Two indexes + `GET /workout-logs/stats` + `GET /workout-logs/personal-bests` |
| 1 | Finish screen rebuilt: honest "personal best" / "beat last time" claims, volume, no confetti |
| 2 | `ProgressScreen` in the Plan stack: week streak, totals, 12-week trend |
| 3 | "Your history" on `ExerciseDetail` + `GET /workout-logs/exercise-history`; the §3.4 `'manual'` guard divergence is **fixed** |

**Every acceptance criterion in §5 is met**, including the UTC−7 case — verified by
driving the app with the browser at `America/Los_Angeles` against a session
stored at `2026-07-27T03:00:00Z` (8pm Sunday local): History marks **Sun 26** and
Progress reports **0 sessions this week**, i.e. both bucket locally and agree.

**Decisions taken** from §6, all on that section's own recommendations: Progress
lives in the Plan stack (1), streak is consecutive weeks with ≥1 session (2),
personal best is heaviest set ever (3), e1RM is Epley suppressed above 12 reps
(4), stats window is a rolling 12 months (6).

**Still open:** §6.5 workout-deletion semantics. `WorkoutLog.workout` is still
`onDelete: Cascade` and `deleteWorkout` still has zero callers, so nothing is
broken — but this needs a call **before any delete affordance ships**. Also
unresolved by design: §3.6's planned-vs-actual *set* adherence, which stays
unrecoverable retroactively because only completed sets are persisted.

> ⚠️ **Deploy ordering changed in Phase 3.** This work is no longer
> frontend-only: Phase 3 added a third read endpoint. The backend must be live
> before the app ships, or Progress shows its error state and the history
> section silently hides. **Saving a workout is unaffected either way** — no
> request gained a field, so §3.3's `forbidNonWhitelisted` hazard was never
> exposed.

> **On the review yield:** pass 2 found three structural issues, pass 3 found four, pass 4 found one real bug plus one self-correction and two wording fixes. The findings are shifting from *structural* to *cosmetic* — the signal that static review is close to exhausted here. Remaining risk (query performance, device behaviour, real-data shape) is the kind that only measurement resolves. **Build Phase 0 and measure; don't spend another pass reading.**

> **Key takeaway up front:** this is not one missing screen — it's a missing *layer*. Every set's reps/weight/RPE already lands in `CompletedSet`, `WorkoutLog.totalVolume` is computed and stored on every session, and none of it is rendered anywhere. The query helpers and progression math are largely written (§2). What's missing is aggregation + presentation.
>
> **Read §3 before writing code.** Seven traps, three load-bearing: a `dayKey` migration done naively **breaks workout saving for every user** (§3.3); the design must survive a user who never types a weight (§3.1); and **"personal best" cannot be computed from the existing 30-log window** — doing so ships false PRs (§3.7).

---

## 1. Symptom

The app is a careful logging pipeline with no payoff at the end of it.

| Surface | What it shows today | Evidence |
|---|---|---|
| Finish screen | Total time + total sets. Two numbers, ~55% empty screen. | `WorkoutSession.tsx:2029-2068` |
| `totalVolume` | Computed every session, written to the DB, **never rendered anywhere.** | computed `WorkoutSession.tsx:687-696`; stored `workout-logs.service.ts:38` |
| History (`CalendarScreen`) | Month grid + raw per-set dump. No streak, no totals, no trend. Bottom ~60% empty with real logs in it. | `CalendarScreen.tsx` |
| ExerciseDetail | Nothing — verified zero references to logs or history. | `ExerciseDetailScreen.tsx` |
| Backend | No user-stats endpoint at all. | §2 name-collision warning |

Also the retention gap: people reopen a fitness app to watch the line go up. `docs/future.md` does **not** mention progress, streaks, or PRs anywhere — every other known gap is written down; this one is a genuine blind spot rather than a deferred decision.

---

## 2. What already exists — reuse, don't rebuild

> ⚠️ **Name collision:** `GET /api/exercises/stats` **already exists** (`exercises.controller.ts:72` → `exercises.service.ts:664`) and is **catalog metadata** — `total`, `byMuscleGroup`, `byEquipment`, `byMovementPattern`. Nothing user-specific. Don't extend it; user stats belong under `workout-logs`.

**`backend/src/workout-logs/last-performance.ts`** (139 lines + 185 lines of specs) — roughly 60% of the query layer, deliberately dependency-free (plain functions, no Nest provider, so any module can import them without a `WorkoutLogsModule ↔ WorkoutsModule` cycle):
- `isTrackableExerciseId()` — filters `draft_` / `applied_` / `generated_` prefixes **and the literal `'manual'`** (§3.2, §3.4)
- `pickLastEntriesForExercises()` — walks logs newest-first, per exercise id
- `bestCompletedSetByWeight()` — heaviest completed set, ties keep the earlier set, weight omitted for bodyweight
- `fetchLastEntriesForExercises()` — Prisma fetch + reduce, bounded by `RECENT_LOGS_WINDOW = 30`

**`frontend/src/lib/nextTargetSuggestion.ts`** — progression math, pure and tested: plate-step rounding (`roundToStep`), lower-body detection, time-based exclusion, `MAX_INCREMENT_FRACTION` guard. Its header comment explicitly anticipates moving server-side.

**`frontend/src/lib/weightDisplay.ts`** — storage is **always pounds**; conversion happens only at the display boundary. Verified end-to-end: session state is lb throughout (`WorkoutSession.tsx:1573` converts kg input → lb on entry; `:1591-1604` lb → kg for display). Aggregate in lb, convert once at render.

**`frontend/src/screens/WeightTrackerScreen.tsx`** — a working bar trend with **no charting library** (`TREND_BARS = 30`, oldest→newest). Copy this pattern; do not add a chart dependency.

**`frontend/src/screens/CalendarScreen.tsx:196-199`** — already groups logs by **device-local** day via `formatLocalYmd`. This is the convention to follow (§3.3).

**`frontend/src/lib/homeToday.ts` — `buildHomeWeekDots()`** computes planned-vs-completed for the current week.
> ⚠️ **Narrower than it looks.** It returns `[]` when `currentProgramWeek == null` (i.e. outside the program window), and it only counts **plan-linked** workouts — completion is matched by `planSlotLinksWeeklyWorkout` → `workoutId`. Fine for a *current-week adherence line*; **wrong as a streak foundation**, which must work after a plan ends and must count ad-hoc sessions. Build streaks from logs directly.

---

## 3. Six traps

### 3.1 Volume will be zero for a lot of real sessions — do not lead with it

`WorkoutSession.tsx:687-696` filters `set.completed && set.weight`, so **bodyweight sets contribute nothing to `totalVolume`.** Compounding it: generated plans ship `weight: undefined` (`workout-generator.service.ts:2429, 2481`) — in the local run-through, **every set displayed `—`**. Weight only starts flowing from a user's *second* session of a given exercise, once the shipped last-performance prefill (PR #14) fills it in.

**Design rule:** lead with metrics that always exist — **sessions completed, sets, duration, streak**. Layer volume, PRs and e1RM on top, rendered only where weight data exists. Every volume-derived tile needs a designed empty state, not a zero.

### 3.2 `'manual'` is a shared bucket, not an exercise

`workout-logs.service.ts:42` defaults any entry without a library id to the literal string `'manual'`:

```ts
exerciseId: entry.exerciseId ?? 'manual',
```

A naive `GROUP BY exerciseId` merges **every hand-added exercise a user has ever logged, across all time, into one meaningless row.** `isTrackableExerciseId()` already exists for exactly this. Use it; don't write a second guard.

### 3.3 Local-vs-UTC days — and the migration that breaks saving

**The bug is real and this codebase has already been bitten by it once.** `body-weight.service.ts:13-15` carries the scar tissue in a comment:

> *"bucketing by UTC day made a US evening entry replace the previous local day's. UTC-day fallback covers clients that omit it."*

`workout-logs.service.ts:71-83` has the same shape today — it takes local `YYYY-MM-DD` strings from the client and interprets them server-side (`new Date(from)` = UTC midnight; `to.setHours(...)` = server-local). It's *currently* mostly harmless because the client re-groups by device-local day afterward (`CalendarScreen.tsx:199`), so only window edges clip. **But any server-computed streak would silently use UTC days and disagree with the calendar the user is looking at.** Streaks are the number people screenshot.

**Revised recommendation — do NOT add a `dayKey` column for v1.** The first draft of this plan proposed mirroring `BodyWeightEntry.dayKey`. On review that's the wrong trade:

- The server returns **raw per-session material** (`startedAt`, duration, sets, volume, per-exercise bests) — bounded and cheap.
- The **client** buckets into local days/weeks for streaks and calendars, exactly as `CalendarScreen.tsx:199` already does.
- Zero migration, zero DTO change, zero deploy hazard, and it is *automatically* consistent with the calendar because it's the same code path.

Add `dayKey` later, only if a genuine server-side consumer appears.

> 🚨 **If `dayKey` is ever added, deploy ordering is a hard gate — not a preference.** The global pipe runs `forbidNonWhitelisted: true` (`main.ts:70-74`). A client that sends a field the DTO doesn't declare gets the **entire request rejected with 400**. Adding `dayKey` to the `saveWorkoutLog` payload before `CreateWorkoutLogDto` accepts it means **every workout save fails** and users lose sessions from history.
>
> This is not hypothetical: commit **`07c89b6`** (2026-07-14) fixed exactly this — *"the global ValidationPipe runs with forbidNonWhitelisted — so the missing experienceLevel and mesoHint fields rejected EVERY real repair request with 400."* That one degraded silently; this one would be user-visible data loss.
>
> Frontend ships over OTA/TestFlight **independently** of the Render backend deploy. Backend must be deployed and verified live **first**, always.

> ⚠️ **And if it is added: do not copy the constraint.** `BodyWeightEntry` has `@@unique([userId, dayKey])` because there's one weigh-in per day. **A user can log several workouts in one day** — confirmed live (two logs on the 27th, rendered as a `2` badge on the calendar cell). `WorkoutLog` would need `@@index([userId, dayKey])`, **never** `@@unique`.

### 3.4 Some logged exercises are structurally untrackable

`plans.service.ts:502` assigns a synthetic id when the generator produced a row with no library id:

```ts
exerciseId: (e.exerciseId && String(e.exerciseId).trim()) || `generated_${pw.id...}_${i}`,
```

`isTrackableExerciseId()` correctly excludes these, so **per-exercise** history will have holes. Session-level totals (sessions, sets, duration, volume) are unaffected — they key off sets, not ids. Another reason to lead with session-level metrics (§3.1). The Progress UI must not imply per-exercise coverage is complete.

> ⚠️ **The frontend and backend guards diverge on `'manual'` — this becomes a live bug in Phase 3.**
>
> | Guard | Rejects `draft_`/`applied_`/`generated_` | Rejects `'manual'` |
> |---|---|---|
> | backend `isTrackableExerciseId` (`last-performance.ts:50-56`) | yes | **yes** |
> | frontend `isLinkableLibraryExerciseId` (`exerciseNavigation.ts:6-11`) | yes | **no** |
>
> The divergence is deliberate and documented (the backend comment calls `'manual'` "the service-side fallback"), and it is harmless **today** because `'manual'` only ever exists in `WorkoutLogEntry.exerciseId` — a table the frontend never renders. **Phase 3 renders exactly that table.** A `'manual'` entry would pass the frontend guard, be treated as a linkable library id, and navigate to an exercise-detail page for an exercise that does not exist. Fix the frontend guard (or gate on a shared constant) *before* rendering log entries, not after.

### 3.5 Deleting a workout destroys its logs (latent, guard before shipping)

`schema.prisma:222` — `WorkoutLog.workout` is `onDelete: Cascade`. `DELETE /api/workouts/:id` is live (`workouts.controller.ts:102` → `workouts.service.ts:390`).

**Currently latent:** `deleteWorkout` exists in `frontend/src/services/workoutService.ts:95` but has **zero callers** — verified. The only other `workout.deleteMany` paths are account deletion (`users.service.ts:84`, correct) and a share double-accept race healing seconds-old clones (`shares.service.ts:329`, safe).

**Why it matters here:** progress makes logged history valuable in a way it isn't today, and a "delete this workout" affordance is a plausible near-term addition — the pre-start workout screen already carries a per-*exercise* trash affordance ("trash removes from this workout"), so extending deletion to the workout itself is a small UI step with a large data consequence. The day someone wires up `deleteWorkout`, users silently lose history. Decide the intended semantics *now* — `onDelete: SetNull` with a nullable `workoutId`, or an explicit guard refusing to delete workouts that have logs.

### 3.6 Only completed sets are ever persisted

`workout-logs.service.ts:48` filters `s.completed` before write. This keeps aggregation simple — but it also means planned-vs-actual **set** adherence is unrecoverable retroactively. If that metric is ever wanted, it's a schema decision to make now, not later.

Separately: the app generates 3–6 day/week plans with **deliberate rest days**, so a consecutive-*day* streak breaks every week by design and reads as failure to someone who trained exactly as prescribed. **Ship a week streak** (consecutive calendar weeks with ≥1 logged session), paired with a "3 of 4 sessions this week" line — noting §2's caveat that the week-dots helper only covers the current program window.

### 3.7 The query layer is sized for "last time", not "all time"

Every existing read is deliberately near-term. Progress is the first feature that asks historical questions, and four things break at that boundary.

**a) "Personal best" cannot come from the existing window — this would ship false PRs.**
`fetchLastEntriesForExercises` is bounded at `take: RECENT_LOGS_WINDOW` = **30 logs** (`last-performance.ts:130-137`). At 4 sessions/week that is roughly **seven weeks**. Reducing `bestEver` over that window (as pass 2 of this plan proposed) yields *best-in-recent-sessions*, not a personal best: a user who benched 225 in March and hits 215 today gets a celebratory **"New PR!"** that is simply false. Nothing erodes trust in a stats screen faster.

Personal bests need a separate **aggregate** query — `_max` over `CompletedSet` filtered through `WorkoutLogEntry.exerciseId` to the user — which is unbounded and cheap, rather than a reduce over fetched rows. Also define the metric explicitly: heaviest set ever is the simplest defensible definition; best-at-a-given-rep-count and best-e1RM are different numbers and users will notice the difference.

**b) Do not reuse `findAll` for stats.** `workout-logs.service.ts:84-92` has **no `take`** and eagerly includes `entries → completedSets`. Existing callers are safe because they ask for a bounded range (Home = 1 week, Calendar = 1 month). A progress screen asking for a year would pull **every set of every workout** — potentially megabytes over mobile data. The stats endpoint needs its own narrow projection.

**c) Streak windows must be time-based, not count-based.** A count bound of 30 logs truncates any streak longer than ~7 weeks, silently capping the headline number. Streaks need a *date range* (e.g. rolling 12 months) and only need `startedAt` — no entries, no sets. That is a different query shape and a different bound from (a); the stats endpoint should not try to serve both with one fetch.

**d) No index supports any of this.** Verified against `prisma/schema.prisma`:

| Table | Indexes today | Missing for progress |
|---|---|---|
| `WorkoutLog` | `[userId]`, `[workoutId]`, `[startedAt]` | **no composite `[userId, startedAt]`** — the exact filter+order of every stats query |
| `WorkoutLogEntry` | `[workoutLogId]` | **no `exerciseId` index** — the join key for all per-exercise history |
| `CompletedSet` | `[workoutLogEntryId]` | (adequate) |

This is already latent for the shipped `last-performance` feature — masked only because it scans 30 logs. It stops being masked the moment anything asks a historical question.

**An index-only migration is safe under §3.3**: no column, no DTO, no request-shape change, therefore no `forbidNonWhitelisted` exposure and no deploy-ordering hazard. It is the one schema change this plan actively recommends.

> **Measured 2026-07-27** (Phase 0 build; `EXPLAIN ANALYZE` against 60k logs / 120k entries across 500 seeded users). Both indexes are justified, but not for the reason the earlier draft gave — it claimed `[userId, startedAt]` serves "every stats query," which the planner disagrees with:
>
> | Case | Index chosen |
> |---|---|
> | 41-log user, 12-month range | `workout_logs_userId_idx` (existing) — nothing to gain from the composite |
> | 120-log user, selective 3-month range | **`workout_logs_userId_startedAt_idx`** — the composite earns its place here |
> | 3120-log user, broad 12-month range | `workout_logs_userId_idx` — planner prefers the plain bitmap |
> | personal bests, selective exercise | **`workout_log_entries_exerciseId_idx`** — 80 rows out of 120k, would otherwise seq-scan |
> | personal bests, *common* exercise (500 users share it) | user-first via `workout_logs_userId_idx` + `workout_log_entries_workoutLogId_idx`, filtering `exerciseId` |
>
> So: the composite is used when the **date range is selective relative to the user's history** — the common middle case, and the default 12-month window for anyone with a year or two of logs. The `exerciseId` index does clear work for selective exercises, and the planner correctly abandons it for common ones in favour of the user-first path. Bare `[exerciseId]` was sufficient; no composite on `WorkoutLogEntry` was needed.

---

## 4. Recommended implementation (phased)

Each phase is independently shippable and verifiable. **Backend deploys before the frontend that consumes it, every phase** (§3.3).

### Phase 0 — indexes + read-only stats endpoint (backend)
- **Index-only migration** (§3.7d): `@@index([userId, startedAt])` on `WorkoutLog`, `@@index([exerciseId])` on `WorkoutLogEntry`. No column, no DTO, no request-shape change → no `forbidNonWhitelisted` exposure. Do this first; it also speeds up the shipped `last-performance` path.
- `GET /api/workout-logs/stats` — per-session summary rows (`startedAt`, duration, sets, volume) plus totals over a **rolling date range** (§3.7c), *not* a log-count bound. **Returns raw material; the client buckets local days/weeks** (§3.3).
- **Write a narrow projection — do not reuse `findAll`** (§3.7b). Select only the summary columns; never eagerly include `entries → completedSets` for a historical range.
- **Separate personal-best aggregate** (§3.7a): `_max` over `CompletedSet` joined through `WorkoutLogEntry.exerciseId`, scoped to the user, **unbounded by log count**. This is a distinct query from the session summary — do not try to serve both from one fetch (§3.7c). Phase 1 depends on it for any "PR" claim.
- Route ordering: literal `'stats'` must sit **above** the `':id'` catch-all, same as the existing `'last-performance'` comment warns.
- Reuse `isTrackableExerciseId` from `last-performance.ts`; the fetch helper there is the wrong shape for this (see §3.7a/b) and should not be extended to serve it.
- Specs covering the degenerate users: a `'manual'`-only user, a bodyweight-only (zero-weight) user, a multi-workout day, a user whose plan has ended, and **a user with more than 30 logged sessions** (the case §3.7a gets wrong).

### Phase 1 — finish screen rebuild

Two different claims, two different costs — **do not conflate them**:

- **"Beat your last time"** is free and offline-safe today. `lastPerformance` is already fetched once at session start (`WorkoutSession.tsx:232-265`) and held in state for the whole session, so the comparison needs **no network call** on the most emotionally important screen and adds no new failure mode.
- **"Personal best"** must come from the Phase 0 aggregate (§3.7a). It **cannot** be reduced from the in-memory last-performance map — that map covers 30 logs (~7 weeks) and would ship false PRs.

If Phase 1 needs to ship before the aggregate is ready, **ship only the last-time comparison** and label it honestly ("best this month" / "beat last session"). Never render an unqualified "PR" backed by a bounded window.

Ordering note: the finish screen renders *before* the log is POSTed (`confirmEndWorkout` → `setShowFinishScreen(true)`; the save happens on `handleFinishComplete`) — confirmed live by network trace — so comparing against fetched history correctly excludes the current session.

Also folds in the standalone "finish screen looks like an earlier era" item. Two changes, both verified:
- Drop the 🎉. It is the **only** multi-colour pictographic emoji in the entire UI (`WorkoutSession.tsx:2031`); every other glyph is monochrome `✕`/`✓` that inherits the text colour.
- Fix the `View History` label — it doesn't view history, it returns to the Workout tab. **It does save correctly** (verified by network trace: the POST fires on both buttons), so this is a labelling fix, not data loss.

> **Correction (pass 4):** earlier drafts of this plan also called the green "View History" button *off-palette*. **That was wrong.** It uses `Button variant="secondary"` → `colors.secondary` = `#6B8F71`, the theme's sage green (`theme/colors.ts:53`, also aliased as `success`). It is fully on-palette and needs no colour change.

### Phase 2 — Progress screen
**Navigation decision needed (§6).** Recommendation: add to `PlanStackNavigator` next to `History`, linked from Home's shortcut list — *not* a fifth tab.

> ⚠️ Navigation in this repo has bitten us repeatedly. See `docs/navigation-route-map.md` and `docs/navigation-qa-checklist.md`; never redirect from an unconditional focus-effect cleanup (filter `beforeRemove` by `action.type`). Verify by **running the app**, not by reading code — two real routing bugs in PR #17 survived nine code-review passes because the culprit lives in `node_modules`.

### Phase 3 — per-exercise history on ExerciseDetail
"Your history with this lift": best set, e1RM trend, last N sessions — keyed by `exerciseId` off the Phase 1 payload shape. Must degrade gracefully for `generated_` / `manual` rows (§3.4).

---

## 5. Acceptance criteria

- A brand-new user with **zero logged weight** sees a coherent Progress screen (sessions, sets, duration, streak) with designed empty states — never a wall of zeroes or an empty chart.
- A bodyweight-only user never sees a "0 lb" volume claim.
- Hand-added and `generated_`-id exercises never surface as lumped or bogus per-exercise rows.
- The week streak matches the History calendar **for a user in a non-UTC timezone** (test at UTC−7 with an 8pm local session).
- Streaks and totals still work **after a plan ends** and **count ad-hoc, non-plan workouts** (the week-dots helper covers neither — §2).
- Logging two workouts in one day works and both appear.
- **A user with >30 logged sessions never sees a false PR.** Seed 40 sessions with the heaviest set in the *oldest* one and confirm today's lighter set is not celebrated (§3.7a).
- A streak longer than ~7 weeks reports its true length rather than capping (§3.7c).
- The stats response for a year of history stays small enough for mobile data — no nested per-set payload (§3.7b).
- **Regression gate:** saving a workout still succeeds against a backend that has *not* been redeployed (i.e. no new request fields were added) — or, if any were, the backend is confirmed live first (§3.3).
- `npm test` green in both projects; new backend specs cover the five degenerate users in Phase 0.
- No new charting dependency in `frontend/package.json`.

---

## 6. Open decisions

1. **Where does Progress live?** Fifth tab / inside Plan stack next to History / from Profile. **Recommendation: Plan stack** — a fifth tab is a bigger navigation change than the payoff justifies, and this navigator is fragile.
2. **Streak definition.** **Recommendation: consecutive weeks with ≥1 session.** Alternative: weeks meeting the plan's prescribed count (harsher, more meaningful, more likely to read as failure).
3. **What counts as a "personal best"?** (§3.7a) Heaviest set ever is the simplest defensible definition and the cheapest aggregate. Best-at-a-given-rep-count and best-e1RM are different numbers, and users *will* notice which one you picked. **Recommendation: heaviest set ever**, labelled plainly.
4. **e1RM formula**, if shown at all. Epley (`w × (1 + r/30)`) is the usual default. Cap it — meaningless above ~12 reps, so suppress rather than display for high-rep sets.
5. **Workout-deletion semantics** (§3.5) — `SetNull` + nullable `workoutId`, or refuse-to-delete-with-logs. Needs a call before any delete UI ships, not before Phase 0.
6. **Stats window depth.** A rolling **date** range (§3.7c) — 12 months is a reasonable default. Note this is a *different* bound from the existing `RECENT_LOGS_WINDOW = 30` count bound, which stays as-is for last-performance.

---

## 7. Pointers

**Backend**
- `src/workout-logs/last-performance.ts` (+ `.spec.ts`) — reuse `isTrackableExerciseId` / `bestCompletedSetByWeight`; **`:130-137` is the `take: 30` bound that makes it unusable for all-time bests** (§3.7a)
- `src/workout-logs/workout-logs.service.ts` — `:38` volume store, `:42` `'manual'` default, `:48` completed-only filter, `:71-83` UTC window, **`:84-92` the unbounded `findAll` not to reuse** (§3.7b)
- `prisma/schema.prisma` — index gaps (§3.7d): `WorkoutLog` `:226-228`, `WorkoutLogEntry` `:248`, `CompletedSet` `:269`
- `src/workout-logs/workout-logs.controller.ts` — literal routes must precede `':id'`
- `src/main.ts:70-74` — `forbidNonWhitelisted: true` (§3.3); prior incident `07c89b6`
- `src/body-weight/body-weight.service.ts:13-15` — the local-day scar tissue
- `src/plans/plans.service.ts:502` — `generated_` id fallback
- `src/workouts/workouts.service.ts:390`, `workouts.controller.ts:102` — the delete path
- `prisma/schema.prisma:222` — the `WorkoutLog` cascade
- `src/exercises/exercises.controller.ts:72` — the *catalog* stats endpoint, not this

**Frontend**
- `src/components/WorkoutSession.tsx:232-265` (last-performance fetch), `:687-696` (volume math), `:2029-2068` (finish screen)
- `src/screens/CalendarScreen.tsx:196-199` (local-day grouping)
- `src/screens/WeightTrackerScreen.tsx` (chart pattern, `TREND_BARS`)
- `src/lib/nextTargetSuggestion.ts`, `weightDisplay.ts`, `homeToday.ts`
- `src/services/workoutService.ts` (`saveWorkoutLog` payload; `deleteWorkout:95`, currently uncalled)

**Last reviewed:** 2026-07-27 (second pass — see Status)
